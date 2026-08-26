import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { POST } from '@/app/api/auth/reset-password/route';
import { prisma } from '@/lib/db';

jest.mock('bcryptjs', () => ({ hash: jest.fn() }));

jest.mock('@/lib/db', () => ({
  prisma: {
    passwordResetToken: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/monitoring/server', () => ({
  reportServerError: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  passwordResetToken: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

describe('/api/auth/reset-password route contract', () => {
  const rawToken = 'reset-token-from-email';
  const resetToken = {
    id: BigInt(8),
    email: 'golfer@example.com',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  let tx: {
    passwordResetToken: { updateMany: jest.Mock };
    user: { update: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      passwordResetToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(resetToken);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: BigInt(42) });
    mockedPrisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-password-hash');
  });

  async function submitReset() {
    return POST(new Request('https://www.golfiq.ca/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, password: 'NewPassword123' }),
    }) as any);
  }

  it('looks up the token hash and atomically revokes existing sessions', async () => {
    const response = await submitReset();

    expect(response.status).toBe(200);
    expect(mockedPrisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: {
        token: crypto.createHash('sha256').update(rawToken).digest('hex'),
      },
    });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: resetToken.id, usedAt: null }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: BigInt(42) },
      data: {
        passwordHash: 'new-password-hash',
        sessionsValidAfter: expect.any(Date),
      },
    });
  });

  it('rejects a token lost to a concurrent reset attempt', async () => {
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    const response = await submitReset();
    expect(response.status).toBe(400);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
