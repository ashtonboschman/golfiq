import { GET } from '@/app/api/users/[id]/public/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getBlockStateBetweenUsers } from '@/lib/socialSafety';

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
    userLeaderboardStats: {
      findUnique: jest.fn(),
    },
    friend: {
      findFirst: jest.fn(),
    },
    friendRequest: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/socialSafety', () => ({
  getBlockStateBetweenUsers: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  userLeaderboardStats: { findUnique: jest.Mock };
  friend: { findFirst: jest.Mock };
  friendRequest: { findFirst: jest.Mock };
};
const mockedGetBlockStateBetweenUsers = getBlockStateBetweenUsers as jest.Mock;

describe('/api/users/[id]/public route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(2),
      username: 'blocked-user',
      profile: {
        firstName: 'Blocked',
        lastName: 'User',
        avatarUrl: '/avatars/blocked.png',
        bio: 'Bio',
        dashboardVisibility: 'public',
        favoriteCourse: { courseName: 'MacGregor' },
      },
    });
    mockedPrisma.userLeaderboardStats.findUnique.mockResolvedValue({
      handicap: 12.3,
      totalRounds: 21,
      averageToPar: 8.4,
      bestToPar: 1,
    });
    mockedPrisma.friend.findFirst.mockResolvedValue(null);
    mockedPrisma.friendRequest.findFirst.mockResolvedValue(null);
    mockedGetBlockStateBetweenUsers.mockResolvedValue({
      eitherBlocked: true,
      blockedByA: true,
      blockedByB: false,
    });
  });

  it('returns limited profile and hides dashboard/stats for blocked relationship', async () => {
    const response = await GET(
      new Request('http://localhost/api/users/2/public') as any,
      { params: Promise.resolve({ id: '2' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.relationship).toEqual(
      expect.objectContaining({
        status: 'blocked',
        blocked_by_viewer: true,
        blocked_viewer: false,
      }),
    );
    expect(body.permissions).toEqual(
      expect.objectContaining({
        can_view_dashboard: false,
        can_view_stats: false,
      }),
    );
    expect(body.stats).toEqual({
      handicap: null,
      total_rounds: null,
      average_to_par: null,
      best_to_par: null,
    });
    expect(mockedPrisma.userLeaderboardStats.findUnique).not.toHaveBeenCalled();
  });
});
