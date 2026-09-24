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
    $queryRaw: jest.fn(),
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
  $queryRaw: jest.Mock;
  friend: { findMany: jest.Mock };
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
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    mockedPrisma.friend.findMany.mockResolvedValue([]);
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
    mockedPrisma.$queryRaw.mockResolvedValue([{ user_id: BigInt(2), rank: BigInt(1) }]);
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
    mockedPrisma.$queryRaw.mockResolvedValue([{ user_id: BigInt(1), rank: BigInt(76) }]);
    mockedPrisma.userLeaderboardStats.count
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
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('preserves competition ties, display order, and one rank read for the global top list', async () => {
    const stat = (id: number, handicap: string) => ({
      userId: BigInt(id), handicap, averageToPar: null, bestToPar: null,
      totalRounds: 5, user: { profile: { firstName: `Player${id}`, lastName: null, avatarUrl: null } },
    });
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([
      stat(2, '1.0'), stat(4, '2.0'), stat(3, '2.0'), stat(5, '3.0'),
    ]);
    mockedPrisma.$queryRaw.mockResolvedValue([
      { user_id: BigInt(2), rank: BigInt(1) },
      { user_id: BigInt(4), rank: BigInt(2) },
      { user_id: BigInt(3), rank: BigInt(2) },
      { user_id: BigInt(5), rank: BigInt(4) },
    ]);

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=global') as any);
    const body = await response.json();

    expect(body.users.map((row: any) => [row.user_id, row.rank])).toEqual([
      [2, 1], [4, 2], [3, 2], [5, 4],
    ]);
    expect(body).toEqual(expect.objectContaining({
      isPremium: false, totalUsers: 75, showingLimited: false, hasMore: false,
    }));
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('keeps the viewer inside the top list without duplication or another rank count', async () => {
    const viewer = {
      userId: BigInt(1), handicap: '1.0', averageToPar: null, bestToPar: null, totalRounds: 5,
    };
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([{
      ...viewer, user: { profile: { firstName: 'Free', lastName: 'Golfer', avatarUrl: null } },
    }]);
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue(viewer);
    mockedPrisma.$queryRaw.mockResolvedValue([{ user_id: BigInt(1), rank: BigInt(1) }]);

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=global') as any);
    const body = await response.json();

    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toEqual(expect.objectContaining({ user_id: 1, rank: 1 }));
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('retains the no-entry viewer response', async () => {
    const response = await GET(new Request('http://localhost/api/leaderboard?scope=global') as any);
    const body = await response.json();

    expect(body).toEqual({
      type: 'success', users: [], isPremium: false, totalUsers: 75, showingLimited: false, hasMore: false,
    });
    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps the legacy capped viewer row when its aggregate is ineligible', async () => {
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue({
      userId: BigInt(1), handicap: null, averageToPar: null, bestToPar: null, totalRounds: 0,
    });

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=global') as any);
    const body = await response.json();

    expect(body.users).toEqual([expect.objectContaining({ user_id: 1, rank: 51, handicap: null })]);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(2);
  });

  it('ranks a premium global page across its page boundary with one rank read', async () => {
    mockedIsPremiumUser.mockReturnValue(true);
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([
      { userId: BigInt(2), handicap: '2.0', averageToPar: null, bestToPar: null,
        totalRounds: 5, user: { profile: null } },
      { userId: BigInt(3), handicap: '2.0', averageToPar: null, bestToPar: null,
        totalRounds: 5, user: { profile: null } },
    ]);
    mockedPrisma.$queryRaw.mockResolvedValue([
      { user_id: BigInt(2), rank: BigInt(25) },
      { user_id: BigInt(3), rank: BigInt(25) },
    ]);

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=global&page=2&limit=2') as any);
    const body = await response.json();

    expect(body.users.map((row: any) => row.rank)).toEqual([25, 25]);
    expect(body.hasMore).toBe(true);
    expect(mockedPrisma.userLeaderboardStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 }),
    );
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('ranks accepted friends and the viewer within the blocked-filtered friend population', async () => {
    mockedGetBlockedUserIdsForUser.mockResolvedValue([BigInt(4)]);
    mockedPrisma.friend.findMany.mockResolvedValue([
      { userId: BigInt(1), friendId: BigInt(2) },
      { userId: BigInt(3), friendId: BigInt(1) },
      { userId: BigInt(1), friendId: BigInt(4) },
    ]);
    mockedPrisma.userLeaderboardStats.count.mockResolvedValue(3);
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([2, 3, 1].map(id => ({
      userId: BigInt(id), handicap: id, averageToPar: null, bestToPar: null,
      totalRounds: 5, user: { profile: null },
    })));
    mockedPrisma.$queryRaw.mockResolvedValue([2, 3, 1].map((id, index) => ({
      user_id: BigInt(id), rank: BigInt(index + 1),
    })));

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=friends') as any);
    const body = await response.json();

    expect(body.users.map((row: any) => [row.user_id, row.rank])).toEqual([[2, 1], [3, 2], [1, 3]]);
    expect(body).toEqual(expect.objectContaining({
      isPremium: false, totalUsers: 3, showingLimited: false, hasMore: false,
    }));
    expect(mockedPrisma.friend.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: BigInt(1) }, { friendId: BigInt(1) }] },
    });
    expect(mockedPrisma.userLeaderboardStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: [BigInt(2), BigInt(3), BigInt(4), BigInt(1)], notIn: [BigInt(4)] },
        }),
      }),
    );
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('keeps exact tied Friends ranks on a descending later page', async () => {
    mockedPrisma.friend.findMany.mockResolvedValue([2, 3, 4, 5].map(id => ({
      userId: BigInt(1), friendId: BigInt(id),
    })));
    mockedPrisma.userLeaderboardStats.count.mockResolvedValue(5);
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([4, 5].map(id => ({
      userId: BigInt(id), handicap: '2.0', averageToPar: null, bestToPar: null,
      totalRounds: 5, user: { profile: null },
    })));
    mockedPrisma.$queryRaw.mockResolvedValue([4, 5].map(id => ({
      user_id: BigInt(id), rank: BigInt(3),
    })));

    const response = await GET(new Request(
      'http://localhost/api/leaderboard?scope=friends&sortOrder=desc&page=2&limit=2',
    ) as any);
    const body = await response.json();

    expect(body.users.map((row: any) => [row.user_id, row.rank])).toEqual([[4, 3], [5, 3]]);
    expect(body.hasMore).toBe(true);
    expect(mockedPrisma.userLeaderboardStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ handicap: 'desc' }], skip: 2, take: 2 }),
    );
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.userLeaderboardStats.count).toHaveBeenCalledTimes(1);
  });

  it('includes the viewer as the sole Friends row without a separate append', async () => {
    mockedPrisma.userLeaderboardStats.count.mockResolvedValue(1);
    mockedPrisma.userLeaderboardStats.findMany.mockResolvedValue([{
      userId: BigInt(1), handicap: '30.0', averageToPar: null, bestToPar: null,
      totalRounds: 5, user: { profile: null },
    }]);
    mockedPrisma.$queryRaw.mockResolvedValue([{ user_id: BigInt(1), rank: BigInt(1) }]);

    const response = await GET(new Request('http://localhost/api/leaderboard?scope=friends') as any);
    const body = await response.json();

    expect(body.users).toEqual([expect.objectContaining({ user_id: 1, rank: 1 })]);
    expect(mockedPrisma.userLeaderboardStats.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
