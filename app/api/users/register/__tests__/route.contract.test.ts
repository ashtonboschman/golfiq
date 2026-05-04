import { POST } from '@/app/api/users/register/route';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import {
  EMAIL_FROM,
  generateEmailVerificationEmail,
  generateNewSignupInternalNotificationEmail,
  sendEmail,
  sendInternalNotificationEmail,
} from '@/lib/email';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    emailVerificationToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
  sendInternalNotificationEmail: jest.fn(),
  generateEmailVerificationEmail: jest.fn(),
  generateNewSignupInternalNotificationEmail: jest.fn(),
  EMAIL_FROM: {
    NOREPLY: 'noreply@golfiq.ca',
    UPDATES: 'updates@golfiq.ca',
  },
}));

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

type MockPrisma = {
  user: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  emailVerificationToken: {
    deleteMany: jest.Mock;
    create: jest.Mock;
  };
};

const mockedBcrypt = bcrypt as unknown as { hash: jest.Mock };
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedSendEmail = sendEmail as jest.Mock;
const mockedGenerateVerificationEmail = generateEmailVerificationEmail as jest.Mock;
const mockedGenerateInternalSignupEmail = generateNewSignupInternalNotificationEmail as jest.Mock;
const mockedSendInternalNotificationEmail = sendInternalNotificationEmail as jest.Mock;
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;

describe('/api/users/register route contract', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.env.NEXT_PUBLIC_APP_URL = 'https://www.golfiq.ca';

    mockedPrisma.user.findFirst.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue({
      id: BigInt(42),
      email: 'newuser@example.com',
      profile: {
        firstName: 'New',
        lastName: 'User',
      },
    });
    mockedPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockedPrisma.emailVerificationToken.create.mockResolvedValue({ id: BigInt(1) });
    mockedBcrypt.hash.mockResolvedValue('hashed-password');
    mockedGenerateVerificationEmail.mockReturnValue({
      subject: 'Verify your email',
      html: '<p>verify</p>',
      text: 'verify',
    });
    mockedGenerateInternalSignupEmail.mockReturnValue({
      subject: 'Internal signup',
      html: '<p>internal</p>',
      text: 'internal',
    });
    mockedSendEmail.mockResolvedValue(true);
    mockedSendInternalNotificationEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('registers a new user in public beta mode and sends verification email', async () => {
    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'NewUser@Example.com',
        password: 'Password123',
        first_name: 'New',
        last_name: 'User',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual(
      expect.objectContaining({
        id: '42',
        email: 'newuser@example.com',
        first_name: 'New',
        last_name: 'User',
      }),
    );

    expect(mockedPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: expect.objectContaining({
            equals: 'newuser@example.com',
          }),
        }),
      }),
    );
    expect(mockedPrisma.user.create).toHaveBeenCalled();
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'newuser@example.com',
        from: EMAIL_FROM.NOREPLY,
      }),
    );
    expect(mockedSendInternalNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Internal signup',
        from: EMAIL_FROM.UPDATES,
      }),
    );
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.signupCompleted,
        properties: expect.objectContaining({
          signup_method: 'password',
          registration_mode: 'public_beta',
          email_verification_sent: true,
        }),
      }),
    );
  });

  it('returns duplicate email error from fast-path lookup', async () => {
    mockedPrisma.user.findFirst.mockResolvedValue({ id: BigInt(7) });

    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'Password123',
        first_name: 'Ex',
        last_name: 'Isting',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/already registered/i);
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it('validates payload and rejects malformed input', async () => {
    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: '123',
        first_name: '',
        last_name: '',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBeTruthy();
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it('handles unique constraint race condition from user.create', async () => {
    mockedPrisma.user.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });

    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'race@example.com',
        password: 'Password123',
        first_name: 'Race',
        last_name: 'Case',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/already registered/i);
  });

  it('still succeeds when verification email fails to send', async () => {
    mockedSendEmail.mockResolvedValue(false);

    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'mailfail@example.com',
        password: 'Password123',
        first_name: 'Mail',
        last_name: 'Fail',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe('newuser@example.com');
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.signupCompleted,
        properties: expect.objectContaining({
          email_verification_sent: false,
        }),
      }),
    );
  });

  it('does not fail registration when internal notification send fails', async () => {
    mockedSendInternalNotificationEmail.mockResolvedValue(false);

    const request = new Request('http://localhost/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'internalfail@example.com',
        password: 'Password123',
        first_name: 'Internal',
        last_name: 'Fail',
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(mockedSendInternalNotificationEmail).toHaveBeenCalled();
  });
});
