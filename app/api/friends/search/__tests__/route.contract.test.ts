import { GET } from '@/app/api/friends/search/route';
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
      findMany: jest.fn(),
    },
    friend: { findMany: jest.fn() },
    friendRequest: { findMany: jest.fn() },
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
  friend: { findMany: jest.Mock };
  friendRequest: { findMany: jest.Mock };
};

describe('/api/friends/search route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findMany.mockResolvedValue([]);
    mockedPrisma.friend.findMany.mockResolvedValue([]);
    mockedPrisma.friendRequest.findMany.mockResolvedValue([]);
  });

  it('keeps blocked users hidden from search results query', async () => {
    const response = await GET(new Request('http://localhost/api/friends/search?q=ash') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(mockedPrisma.friend.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.friendRequest.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              NOT: {
                OR: [
                  {
                    blocksInitiated: {
                      some: {
                        blockedUserId: BigInt(1),
                      },
                    },
                  },
                  {
                    blocksReceived: {
                      some: {
                        blockerId: BigInt(1),
                      },
                    },
                  },
                ],
              },
            }),
          ]),
        }),
      }),
    );
  });

  it('preserves candidate order, response fields, and relationship precedence with batched reads', async () => {
    const ids = [5, 4, 3, 2, 6, 7].map(BigInt);
    mockedPrisma.user.findMany.mockResolvedValue(ids.map((id) => ({
      id,
      profile: { firstName: `Golfer ${id}`, lastName: null, avatarUrl: '/avatar.png' },
      leaderboardStats: null,
    })));
    mockedPrisma.friend.findMany.mockResolvedValue([
      { userId: BigInt(1), friendId: BigInt(2) },
      { userId: BigInt(6), friendId: BigInt(1) },
    ]);
    mockedPrisma.friendRequest.findMany.mockResolvedValue([
      { id: BigInt(30), requesterId: BigInt(1), recipientId: BigInt(3) },
      { id: BigInt(40), requesterId: BigInt(4), recipientId: BigInt(1) },
      { id: BigInt(20), requesterId: BigInt(2), recipientId: BigInt(1) },
      { id: BigInt(50), requesterId: BigInt(1), recipientId: BigInt(5) },
      { id: BigInt(51), requesterId: BigInt(5), recipientId: BigInt(1) },
    ]);

    const response = await GET(new Request('http://localhost/api/friends/search?q=ash') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 50,
      where: expect.objectContaining({ AND: expect.arrayContaining([{ id: { not: BigInt(1) } }]) }),
    }));
    expect(mockedPrisma.friend.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.friend.findMany).toHaveBeenCalledWith({
      where: { OR: [
        { userId: BigInt(1), friendId: { in: ids } },
        { userId: { in: ids }, friendId: BigInt(1) },
      ] },
      select: { userId: true, friendId: true },
    });
    expect(mockedPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.friendRequest.findMany).toHaveBeenCalledWith({
      where: { OR: [
        { requesterId: BigInt(1), recipientId: { in: ids } },
        { requesterId: { in: ids }, recipientId: BigInt(1) },
      ] },
      select: { id: true, requesterId: true, recipientId: true },
    });
    expect(body.results).toEqual([
      { id: 5, first_name: 'Golfer 5', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'outgoing', outgoing_request_id: 50, incoming_request_id: null },
      { id: 4, first_name: 'Golfer 4', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'incoming', outgoing_request_id: null, incoming_request_id: 40 },
      { id: 3, first_name: 'Golfer 3', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'outgoing', outgoing_request_id: 30, incoming_request_id: null },
      { id: 2, first_name: 'Golfer 2', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'friend', outgoing_request_id: null, incoming_request_id: null },
      { id: 6, first_name: 'Golfer 6', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'friend', outgoing_request_id: null, incoming_request_id: null },
      { id: 7, first_name: 'Golfer 7', last_name: null, avatar_url: '/avatar.png', handicap: null, average_score: null, best_score: null, total_rounds: null, status: 'none', outgoing_request_id: null, incoming_request_id: null },
    ]);
  });
});
