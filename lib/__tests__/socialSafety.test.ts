import { prisma } from '@/lib/db';
import {
  clearSocialGraphBetweenUsers,
  getBlockedUserIdsForUser,
} from '@/lib/socialSafety';

jest.mock('@/lib/db', () => ({
  prisma: {
    userBlock: {
      findMany: jest.fn(),
    },
    friend: {
      deleteMany: jest.fn(),
    },
    friendRequest: {
      deleteMany: jest.fn(),
    },
    friendNotification: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  userBlock: { findMany: jest.Mock };
  friend: { deleteMany: jest.Mock };
  friendRequest: { deleteMany: jest.Mock };
  friendNotification: { deleteMany: jest.Mock };
  $transaction: jest.Mock;
};

describe('socialSafety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.friend.deleteMany.mockReturnValue('friend-delete');
    mockedPrisma.friendRequest.deleteMany.mockReturnValue('request-delete');
    mockedPrisma.friendNotification.deleteMany.mockReturnValue('notification-delete');
    mockedPrisma.$transaction.mockResolvedValue([]);
  });

  it('returns the other user for blocks in either direction', async () => {
    mockedPrisma.userBlock.findMany.mockResolvedValue([
      { blockerId: BigInt(7), blockedUserId: BigInt(3) },
      { blockerId: BigInt(4), blockedUserId: BigInt(7) },
    ]);

    await expect(getBlockedUserIdsForUser(BigInt(7))).resolves.toEqual([
      BigInt(3),
      BigInt(4),
    ]);
  });

  it('removes friendships, pending requests, and activity notifications when blocking', async () => {
    await clearSocialGraphBetweenUsers(BigInt(7), BigInt(3));

    expect(mockedPrisma.friendNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: BigInt(7), actorUserId: BigInt(3) },
          { userId: BigInt(3), actorUserId: BigInt(7) },
        ],
      },
    });
    expect(mockedPrisma.$transaction).toHaveBeenCalledWith([
      'friend-delete',
      'request-delete',
      'notification-delete',
    ]);
  });
});
