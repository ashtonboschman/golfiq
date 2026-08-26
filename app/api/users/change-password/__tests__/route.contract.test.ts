import bcrypt from 'bcryptjs';
import { PUT } from '@/app/api/users/change-password/route';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(),
  errorResponse: (message: string, status = 400) =>
    Response.json({ message, type: 'error' }, { status }),
  successResponse: (data: Record<string, unknown>, status = 200) =>
    Response.json({ ...data, type: 'success' }, { status }),
}));

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};

describe('/api/users/change-password route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuth as jest.Mock).mockResolvedValue(BigInt(42));
    mockedPrisma.user.findUnique.mockResolvedValue({ passwordHash: 'old-hash' });
    mockedPrisma.user.update.mockResolvedValue({});
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
  });

  it('updates the password and revokes previously issued sessions', async () => {
    const response = await PUT(new Request('https://www.golfiq.ca/api/users/change-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
      }),
    }) as any);

    expect(response.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: BigInt(42) },
      data: {
        passwordHash: 'new-hash',
        sessionsValidAfter: expect.any(Date),
      },
    });
  });
});
