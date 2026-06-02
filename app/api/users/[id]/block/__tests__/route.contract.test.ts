import { DELETE, POST } from '@/app/api/users/[id]/block/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { clearSocialGraphBetweenUsers } from '@/lib/socialSafety';

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
    userBlock: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/socialSafety', () => ({
  clearSocialGraphBetweenUsers: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  userBlock: { upsert: jest.Mock; deleteMany: jest.Mock };
};
const mockedClearSocialGraphBetweenUsers = clearSocialGraphBetweenUsers as jest.Mock;

describe('/api/users/[id]/block route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findUnique.mockResolvedValue({ id: BigInt(2) });
    mockedPrisma.userBlock.upsert.mockResolvedValue({ id: BigInt(10) });
    mockedPrisma.userBlock.deleteMany.mockResolvedValue({ count: 1 });
    mockedClearSocialGraphBetweenUsers.mockResolvedValue(undefined);
  });

  it('requires auth for block', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const request = new Request('http://localhost/api/users/2/block', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: '2' }) });
    expect(response.status).toBe(401);
  });

  it('prevents self-blocking', async () => {
    const request = new Request('http://localhost/api/users/1/block', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: '1' }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.message).toMatch(/cannot block your own/i);
  });

  it('blocks another user and clears social graph edges', async () => {
    const request = new Request('http://localhost/api/users/2/block', { method: 'POST' });
    const response = await POST(request as any, { params: Promise.resolve({ id: '2' }) });

    expect(response.status).toBe(200);
    expect(mockedPrisma.userBlock.upsert).toHaveBeenCalled();
    expect(mockedClearSocialGraphBetweenUsers).toHaveBeenCalledWith(BigInt(1), BigInt(2));
  });

  it('prevents self-unblocking route misuse', async () => {
    const request = new Request('http://localhost/api/users/1/block', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(400);
  });

  it('returns 404 when user is not currently blocked', async () => {
    mockedPrisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });
    const request = new Request('http://localhost/api/users/2/block', { method: 'DELETE' });
    const response = await DELETE(request as any, { params: Promise.resolve({ id: '2' }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toMatch(/not currently blocked/i);
  });
});
