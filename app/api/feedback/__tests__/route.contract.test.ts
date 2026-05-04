import { POST } from '@/app/api/feedback/route';
import { requireAuth } from '@/lib/api-auth';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import { prisma } from '@/lib/db';
import { EMAIL_FROM, generateFeedbackInternalNotificationEmail, sendInternalNotificationEmail } from '@/lib/email';

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
    userFeedback: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

jest.mock('@/lib/email', () => ({
  sendInternalNotificationEmail: jest.fn(),
  generateFeedbackInternalNotificationEmail: jest.fn(),
  EMAIL_FROM: {
    UPDATES: 'updates@golfiq.ca',
  },
}));

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
  };
  userFeedback: {
    count: jest.Mock;
    create: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;
const mockedSendInternalNotificationEmail = sendInternalNotificationEmail as jest.Mock;
const mockedGenerateFeedbackInternalNotificationEmail = generateFeedbackInternalNotificationEmail as jest.Mock;

describe('/api/feedback route contract', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      profile: {
        firstName: 'Test',
        lastName: 'User',
      },
    });
    mockedPrisma.userFeedback.count.mockResolvedValue(0);
    mockedPrisma.userFeedback.create.mockResolvedValue({ id: BigInt(10) });
    mockedGenerateFeedbackInternalNotificationEmail.mockReturnValue({
      subject: 'Internal feedback',
      html: '<p>feedback</p>',
      text: 'feedback',
    });
    mockedSendInternalNotificationEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bug', message: 'This should fail auth.' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
    expect(mockedPrisma.userFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects too-short feedback and tracks a validation failure', async () => {
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'idea', message: 'too short' }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/at least/i);
    expect(mockedPrisma.userFeedback.count).not.toHaveBeenCalled();
    expect(mockedPrisma.userFeedback.create).not.toHaveBeenCalled();
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.feedbackSubmitFailed,
        properties: expect.objectContaining({ stage: 'validation' }),
      }),
    );
  });

  it('rejects invalid feedback type', async () => {
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'not_real',
        message: 'This is long enough to fail only on type validation.',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/valid feedback type/i);
    expect(mockedPrisma.userFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects too-long feedback message', async () => {
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'idea',
        message: 'a'.repeat(2001),
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/2000 characters or less/i);
    expect(mockedPrisma.userFeedback.create).not.toHaveBeenCalled();
  });

  it('rate limits after 5 submissions in the rolling window', async () => {
    mockedPrisma.userFeedback.count.mockResolvedValue(5);

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'other',
        message: 'This is a valid feedback message for rate limit testing.',
        page: '/settings',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.message).toMatch(/too many feedback submissions/i);
    expect(mockedPrisma.userFeedback.create).not.toHaveBeenCalled();
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.feedbackSubmitFailed,
        properties: expect.objectContaining({ stage: 'rate_limit' }),
      }),
    );
  });

  it('persists valid feedback and tracks submission', async () => {
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'bug',
        message: 'Found a reproducible issue in settings while exporting data.',
        page: '/settings',
        appVersion: '1.2.3',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toMatch(/thanks for your feedback/i);
    expect(mockedPrisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: BigInt(1),
        type: 'bug',
        message: 'Found a reproducible issue in settings while exporting data.',
        page: '/settings',
        appVersion: '1.2.3',
      }),
    });
    expect(mockedSendInternalNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Internal feedback',
        from: EMAIL_FROM.UPDATES,
      }),
    );
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.feedbackSubmitted,
        properties: expect.objectContaining({
          feedback_type: 'bug',
          feedback_page: '/settings',
        }),
      }),
    );
  });

  it('truncates page and appVersion to max configured lengths', async () => {
    const longPage = '/settings/' + 'x'.repeat(400);
    const longVersion = 'v' + '1'.repeat(200);

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'other',
        message: 'This message is long enough to pass validation constraints.',
        page: longPage,
        appVersion: longVersion,
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedPrisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        page: longPage.slice(0, 255),
        appVersion: longVersion.slice(0, 64),
      }),
    });
  });

  it('does not fail feedback submission when internal notification send fails', async () => {
    mockedSendInternalNotificationEmail.mockResolvedValue(false);

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'idea',
        message: 'This submission should still persist if internal email delivery fails.',
      }),
    });

    const response = await POST(request as any);

    expect(response.status).toBe(201);
    expect(mockedSendInternalNotificationEmail).toHaveBeenCalled();
  });

  it('tracks server_error when persistence fails', async () => {
    mockedPrisma.userFeedback.create.mockRejectedValue(new Error('db down'));

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'bug',
        message: 'This should hit server error tracking path properly.',
      }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toMatch(/failed to submit feedback/i);
    expect(mockedCaptureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ANALYTICS_EVENTS.feedbackSubmitFailed,
        properties: expect.objectContaining({
          stage: 'server_error',
        }),
      }),
    );
  });
});
