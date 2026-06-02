import { POST } from '@/app/api/users/[id]/report/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

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
    userReport: {
      create: jest.fn(),
    },
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  userReport: { create: jest.Mock };
};

describe('/api/users/[id]/report route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findUnique.mockResolvedValue({ id: BigInt(2) });
    mockedPrisma.userReport.create.mockResolvedValue({ id: BigInt(5) });
  });

  it('requires auth', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const request = new Request('http://localhost/api/users/2/report', {
      method: 'POST',
      body: JSON.stringify({ reason: 'spam_or_fake_account' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: '2' }) });
    expect(response.status).toBe(401);
  });

  it('prevents self-reporting', async () => {
    const request = new Request('http://localhost/api/users/1/report', {
      method: 'POST',
      body: JSON.stringify({ reason: 'harassment_or_abuse' }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: '1' }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.message).toMatch(/cannot report your own/i);
  });

  it('creates report for another user', async () => {
    const request = new Request('http://localhost/api/users/2/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'inappropriate_profile_or_avatar',
        details: 'Avatar includes offensive text.',
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: '2' }) });
    expect(response.status).toBe(200);
    expect(mockedPrisma.userReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterId: BigInt(1),
        reportedUserId: BigInt(2),
        reason: 'inappropriate_profile_or_avatar',
      }),
    });
  });

  it('prevents duplicate open reports', async () => {
    mockedPrisma.userReport.create.mockRejectedValue({ code: 'P2002' });

    const request = new Request('http://localhost/api/users/2/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'other',
      }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ id: '2' }) });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.message).toMatch(/already have an open report/i);
  });
});
