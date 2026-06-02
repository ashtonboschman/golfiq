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
  },
}));

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
};

describe('/api/friends/search route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.user.findMany.mockResolvedValue([]);
  });

  it('keeps blocked users hidden from search results query', async () => {
    const response = await GET(new Request('http://localhost/api/friends/search?q=ash') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
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
});
