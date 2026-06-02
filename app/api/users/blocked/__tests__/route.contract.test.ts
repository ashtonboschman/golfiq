import { GET } from '@/app/api/users/blocked/route';
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
    userBlock: {
      findMany: jest.fn(),
    },
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  userBlock: { findMany: jest.Mock };
};

describe('/api/users/blocked route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.userBlock.findMany.mockResolvedValue([
      {
        blockedUserId: BigInt(2),
        createdAt: new Date('2026-06-01T12:00:00.000Z'),
        blockedUser: {
          profile: {
            firstName: 'Blocked',
            lastName: 'User',
            avatarUrl: '/avatars/blocked.png',
          },
        },
      },
    ]);
  });

  it('requires auth', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const response = await GET(new Request('http://localhost/api/users/blocked') as any);
    expect(response.status).toBe(401);
  });

  it('returns only users blocked by current user with safe fields', async () => {
    const response = await GET(new Request('http://localhost/api/users/blocked') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedPrisma.userBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId: BigInt(1) },
      }),
    );
    expect(body.users).toEqual([
      expect.objectContaining({
        id: '2',
        first_name: 'Blocked',
        last_name: 'User',
        avatar_url: '/avatars/blocked.png',
      }),
    ]);
    expect(body.users[0].email).toBeUndefined();
    expect(body.users[0].username).toBeUndefined();
  });
});
