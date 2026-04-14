import { GET, PATCH } from '@/app/api/admin/feedback/route';
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
    userFeedback: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

type MockPrisma = {
  userFeedback: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;

describe('/api/admin/feedback route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/admin/feedback');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 403 when user is not admin', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(2));

    const request = new Request('http://localhost/api/admin/feedback');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Forbidden');
  });

  it('returns serialized feedback list for admin', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.userFeedback.findMany.mockResolvedValue([
      {
        id: BigInt(10),
        userId: BigInt(5),
        type: 'bug',
        message: 'Settings export failed on iPhone Safari.',
        page: '/settings',
        appVersion: '1.0.0',
        status: 'open',
        createdAt: new Date('2026-04-10T10:00:00.000Z'),
        updatedAt: new Date('2026-04-10T10:00:00.000Z'),
        user: {
          email: 'user@example.com',
          profile: {
            firstName: 'Test',
            lastName: 'User',
          },
        },
      },
    ]);

    const request = new Request('http://localhost/api/admin/feedback?type=bug&status=open');
    const response = await GET(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feedback).toHaveLength(1);
    expect(body.feedback[0]).toMatchObject({
      id: '10',
      userId: '5',
      type: 'bug',
      status: 'open',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    });
    expect(mockedPrisma.userFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'bug',
          status: 'open',
        }),
      }),
    );
  });

  it('builds search OR filters when search query is provided', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.userFeedback.findMany.mockResolvedValue([]);

    const request = new Request('http://localhost/api/admin/feedback?search=ios');
    const response = await GET(request as any);

    expect(response.status).toBe(200);
    expect(mockedPrisma.userFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              message: expect.objectContaining({
                contains: 'ios',
              }),
            }),
            expect.objectContaining({
              page: expect.objectContaining({
                contains: 'ios',
              }),
            }),
            expect.objectContaining({
              appVersion: expect.objectContaining({
                contains: 'ios',
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('updates feedback status for admin', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.userFeedback.update.mockResolvedValue({
      id: BigInt(10),
      status: 'resolved',
      updatedAt: new Date('2026-04-10T11:00:00.000Z'),
    });

    const request = new Request('http://localhost/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '10', status: 'resolved' }),
    });

    const response = await PATCH(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feedback).toMatchObject({
      id: '10',
      status: 'resolved',
    });
    expect(mockedPrisma.userFeedback.update).toHaveBeenCalledWith({
      where: { id: BigInt(10) },
      data: { status: 'resolved' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
  });

  it('rejects invalid status updates', async () => {
    mockedRequireAuth.mockResolvedValue(BigInt(1));

    const request = new Request('http://localhost/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '10', status: 'invalid_status' }),
    });

    const response = await PATCH(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/invalid status/i);
    expect(mockedPrisma.userFeedback.update).not.toHaveBeenCalled();
  });
});
