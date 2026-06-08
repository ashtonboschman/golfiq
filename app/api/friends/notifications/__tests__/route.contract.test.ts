import { GET, POST } from '@/app/api/friends/notifications/route';
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
    friendNotification: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  friendNotification: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('/api/friends/notifications route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(7));
    mockedPrisma.friendNotification.findMany.mockResolvedValue([
      {
        id: BigInt(1),
        actorUserId: BigInt(3),
        type: 'friend_request_accepted',
        readAt: null,
        createdAt: new Date('2026-06-05T15:00:00.000Z'),
        actorUser: {
          profile: {
            firstName: 'Taylor',
            lastName: 'Green',
            avatarUrl: '/avatars/taylor.png',
          },
        },
      },
    ]);
    mockedPrisma.friendNotification.updateMany.mockResolvedValue({ count: 1 });
  });

  it('returns only the current user notifications', async () => {
    const response = await GET(new Request('http://localhost/api/friends/notifications') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        id: 1,
        actor_user_id: 3,
        type: 'friend_request_accepted',
        first_name: 'Taylor',
        last_name: 'Green',
        avatar_url: '/avatars/taylor.png',
        read_at: null,
        created_at: '2026-06-05T15:00:00.000Z',
      },
    ]);
    expect(mockedPrisma.friendNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: BigInt(7),
          type: 'friend_request_accepted',
        },
      })
    );
  });

  it('marks only the current user unread accepted notifications as read', async () => {
    const response = await POST(new Request('http://localhost/api/friends/notifications', {
      method: 'POST',
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updatedCount).toBe(1);
    expect(mockedPrisma.friendNotification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: BigInt(7),
        type: 'friend_request_accepted',
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
  });
});
