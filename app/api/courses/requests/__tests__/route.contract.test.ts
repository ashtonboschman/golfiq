import { POST } from '@/app/api/courses/requests/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { EMAIL_FROM, sendAdminNotificationEmail } from '@/lib/email';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    courseRequest: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/email', () => ({
  sendAdminNotificationEmail: jest.fn(),
  EMAIL_FROM: {
    UPDATES: 'updates@golfiq.ca',
  },
}));

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
  };
  courseRequest: {
    create: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedSendAdminNotificationEmail = sendAdminNotificationEmail as jest.Mock;

describe('/api/courses/requests route contract', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedPrisma.courseRequest.create.mockResolvedValue({ id: BigInt(1) });
    mockedPrisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      profile: {
        firstName: 'Test',
        lastName: 'Golfer',
      },
    });
    mockedSendAdminNotificationEmail.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('returns 401 when unauthenticated', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/courses/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseName: 'Pebble Beach' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 400 when courseName is missing', async () => {
    const request = new Request('http://localhost/api/courses/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Monterey' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/course name is required/i);
    expect(mockedPrisma.courseRequest.create).not.toHaveBeenCalled();
  });

  it('saves pending course request and attempts admin notification', async () => {
    const request = new Request('http://localhost/api/courses/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Pebble',
        courseName: 'Pebble Beach Golf Links',
        city: 'Monterey',
        province: 'CA',
        country: 'USA',
        notes: 'Could not find it in search',
        source: 'global_api_no_result',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toMatch(/course request sent/i);
    expect(mockedPrisma.courseRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: BigInt(7),
        courseName: 'Pebble Beach Golf Links',
        status: 'pending',
        source: 'global_api_no_result',
      }),
    });
    expect(mockedSendAdminNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: EMAIL_FROM.UPDATES,
        subject: expect.stringContaining('Pebble Beach Golf Links'),
      }),
    );
  });

  it('does not fail when ADMIN_NOTIFICATION_EMAIL is missing', async () => {
    mockedSendAdminNotificationEmail.mockResolvedValue(null);

    const request = new Request('http://localhost/api/courses/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseName: 'Missing Admin Email Course',
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.courseRequest.create).toHaveBeenCalled();
  });

  it('does not fail when admin notification email send fails', async () => {
    mockedSendAdminNotificationEmail.mockResolvedValue(false);

    const request = new Request('http://localhost/api/courses/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseName: 'Failing Email Course',
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.courseRequest.create).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to send course request admin notification email.',
    );
  });
});

