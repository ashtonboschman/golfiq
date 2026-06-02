import { prisma } from '@/lib/db';

export async function getBlockStateBetweenUsers(
  userIdA: bigint,
  userIdB: bigint,
): Promise<{
  eitherBlocked: boolean;
  blockedByA: boolean;
  blockedByB: boolean;
}> {
  const [aBlockedB, bBlockedA] = await Promise.all([
    prisma.userBlock.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId: userIdA,
          blockedUserId: userIdB,
        },
      },
      select: { id: true },
    }),
    prisma.userBlock.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId: userIdB,
          blockedUserId: userIdA,
        },
      },
      select: { id: true },
    }),
  ]);

  return {
    eitherBlocked: Boolean(aBlockedB || bBlockedA),
    blockedByA: Boolean(aBlockedB),
    blockedByB: Boolean(bBlockedA),
  };
}

export async function clearSocialGraphBetweenUsers(
  userIdA: bigint,
  userIdB: bigint,
): Promise<void> {
  const [first, second] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];

  await prisma.$transaction([
    prisma.friend.deleteMany({
      where: {
        userId: first,
        friendId: second,
      },
    }),
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { requesterId: userIdA, recipientId: userIdB },
          { requesterId: userIdB, recipientId: userIdA },
        ],
      },
    }),
  ]);
}
