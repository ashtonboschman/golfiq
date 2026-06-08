import { POST } from '@/app/api/friends/[id]/accept/route';
import { requireAuth } from '@/lib/api-auth';
import { captureServerEvent } from '@/lib/analytics/server';
import { prisma } from '@/lib/db';
import { getBlockStateBetweenUsers } from '@/lib/socialSafety';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

jest.mock('@/lib/socialSafety', () => ({
  getBlockStateBetweenUsers: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    friend: {
      create: jest.fn(),
    },
    friendNotification: {
      create: jest.fn(),
    },
    friendRequest: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedCaptureServerEvent = captureServerEvent as jest.Mock;
const mockedGetBlockStateBetweenUsers = getBlockStateBetweenUsers as jest.Mock;
const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  friend: { create: jest.Mock };
  friendNotification: { create: jest.Mock };
  friendRequest: { findFirst: jest.Mock; delete: jest.Mock };
  user: { findUnique: jest.Mock };
};

describe('/api/friends/[id]/accept route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(2));
    mockedGetBlockStateBetweenUsers.mockResolvedValue({
      eitherBlocked: false,
      blockedByA: false,
      blockedByB: false,
    });
    mockedPrisma.friendRequest.findFirst.mockResolvedValue({
      id: BigInt(50),
      requesterId: BigInt(1),
      recipientId: BigInt(2),
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: BigInt(1),
      username: 'requester-user',
      profile: {
        firstName: 'Ash',
        lastName: 'Palmer',
        avatarUrl: '/avatars/ash.png',
      },
      leaderboardStats: {
        handicap: 12.4,
        averageToPar: 4.2,
        bestToPar: -1,
        totalRounds: 18,
      },
    });
    mockedPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        friend: {
          create: mockedPrisma.friend.create,
        },
        friendRequest: {
          delete: mockedPrisma.friendRequest.delete,
        },
        friendNotification: {
          create: mockedPrisma.friendNotification.create,
        },
      })
    );
    mockedCaptureServerEvent.mockResolvedValue(undefined);
  });

  it('accepting a friend request creates an accepted notification for the requester', async () => {
    const request = new Request('http://localhost/api/friends/50/accept', {
      method: 'POST',
    });

    const response = await POST(request as any, {
      params: Promise.resolve({ id: '50' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Friend request accepted');
    expect(mockedPrisma.friendNotification.create).toHaveBeenCalledWith({
      data: {
        userId: BigInt(1),
        actorUserId: BigInt(2),
        type: 'friend_request_accepted',
      },
    });
  });

  it('does not create the accepted notification for the user who performed the accept', async () => {
    const request = new Request('http://localhost/api/friends/50/accept', {
      method: 'POST',
    });

    await POST(request as any, {
      params: Promise.resolve({ id: '50' }),
    });

    expect(mockedPrisma.friendNotification.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: BigInt(2),
      }),
    });
  });
});
