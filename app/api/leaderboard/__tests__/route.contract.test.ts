import { GET } from '@/app/api/leaderboard/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { isPremiumUser } from '@/lib/subscription';
import { getBlockedUserIdsForUser } from '@/lib/socialSafety';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    friend: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userLeaderboardStats: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/subscription', () => ({
  isPremiumUser: jest.fn(),
}));

jest.mock('@/lib/socialSafety', () => ({
  getBlockedUserIdsForUser: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedIsPremiumUser = isPremiumUser as jest.Mock;
const mockedGetBlockedUserIdsForUser = getBlockedUserIdsForUser as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  userLeaderboardStats: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
};

describe('/api/leaderboard route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedIsPremiumUser.mockReturnValue(false);
    mockedGetBlockedUserIdsForUser.mockResolvedValue([]);
    mockedPrisma.user.findUnique.mockResolvedValue({
      subscriptionTier: 'free',
      profile: {
        firstName: 'Free',
        lastName: 'Golfer',
        avatarUrl: null,
      },
    });
    mockedPrisma.userLeaderboardStats.count.mockResolvedValue(75);
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([]);
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue(null);
  });

  it('returns up to the top 50 global players for free users', async () => {
    const response = await GET(
      new Request('http://localhost/api/leaderboard?scope=global') as any,
    );

    expect(response.status).toBe(200);
    expect(mockedPrisma.userLeaderboardStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('excludes users blocked in either direction from leaderboard queries', async () => {
    mockedGetBlockedUserIdsForUser.mockResolvedValue([BigInt(2), BigInt(3)]);

    const response = await GET(
      new Request('http://localhost/api/leaderboard?scope=global') as any,
    );

    expect(response.status).toBe(200);
    expect(mockedPrisma.userLeaderboardStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { notIn: [BigInt(2), BigInt(3)] },
        }),
      }),
    );
  });

  it('serializes Decimal leaderboard values as numbers', async () => {
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([
      {
        userId: BigInt(2),
        handicap: '10.2',
        averageToPar: '3.4',
        bestToPar: '-0.0',
        totalRounds: 4,
        user: {
          profile: {
            firstName: 'Test',
            lastName: 'Golfer',
            avatarUrl: null,
          },
        },
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/leaderboard?scope=global') as any,
    );
    const body = await response.json();

    expect(body.users[0]).toEqual(
      expect.objectContaining({
        handicap: 10.2,
        average_score: 3.4,
        best_score: 0,
      }),
    );
  });

  it('caps a free user outside the top 50 at rank 51', async () => {
    mockedPrisma.userLeaderboardStats.count
      .mockResolvedValueOnce(75)
      .mockResolvedValueOnce(75);
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue({
      userId: BigInt(1),
      handicap: 20,
      averageToPar: 18,
      bestToPar: 10,
      totalRounds: 5,
    });

    const response = await GET(
      new Request('http://localhost/api/leaderboard?scope=global') as any,
    );
    const body = await response.json();

    expect(body.users).toEqual([
      expect.objectContaining({
        user_id: 1,
        rank: 51,
      }),
    ]);
  });
});
