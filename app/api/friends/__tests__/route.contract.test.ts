import { POST } from '@/app/api/friends/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { getBlockStateBetweenUsers } from '@/lib/socialSafety';
import { captureServerEvent } from '@/lib/analytics/server';

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
      findFirst: jest.fn(),
    },
    friendRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/socialSafety', () => ({
  getBlockStateBetweenUsers: jest.fn(),
}));

jest.mock('@/lib/analytics/server', () => ({
  captureServerEvent: jest.fn(),
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  friend: { findFirst: jest.Mock };
  friendRequest: { findFirst: jest.Mock; create: jest.Mock };
  user: { findUnique: jest.Mock };
};
const mockedGetBlockStateBetweenUsers = getBlockStateBetweenUsers as jest.Mock;

describe('/api/friends route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedGetBlockStateBetweenUsers.mockResolvedValue({
      eitherBlocked: false,
      blockedByA: false,
      blockedByB: false,
    });
    mockedPrisma.friend.findFirst.mockResolvedValue(null);
    mockedPrisma.friendRequest.findFirst.mockResolvedValue(null);
    mockedPrisma.friendRequest.create.mockResolvedValue({
      id: BigInt(50),
      requesterId: BigInt(1),
      recipientId: BigInt(2),
      createdAt: new Date(),
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      username: 'target-user',
      profile: {
        firstName: 'Target',
        lastName: 'User',
        avatarUrl: '/avatars/default.png',
      },
    });
    (captureServerEvent as jest.Mock).mockResolvedValue(undefined);
  });

  it('blocks friend request creation when either user is blocked', async () => {
    mockedGetBlockStateBetweenUsers.mockResolvedValue({
      eitherBlocked: true,
      blockedByA: true,
      blockedByB: false,
    });

    const request = new Request('http://localhost/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: 2 }),
    });

    const response = await POST(request as any);
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.message).toMatch(/friend request unavailable/i);
    expect(mockedPrisma.friendRequest.create).not.toHaveBeenCalled();
  });

  it('creates friend request when no block is present', async () => {
    const request = new Request('http://localhost/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: 2 }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);
    expect(mockedPrisma.friendRequest.create).toHaveBeenCalled();
  });
});
