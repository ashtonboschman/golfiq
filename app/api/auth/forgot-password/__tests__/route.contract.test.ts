import crypto from 'crypto';
import { POST } from '@/app/api/auth/forgot-password/route';
import { prisma } from '@/lib/db';
import { generatePasswordResetEmail, sendEmail } from '@/lib/email';

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
  generatePasswordResetEmail: jest.fn(),
  EMAIL_FROM: { NOREPLY: 'noreply@golfiq.ca' },
}));

jest.mock('@/lib/monitoring/server', () => ({
  reportServerError: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  passwordResetToken: { deleteMany: jest.Mock; create: jest.Mock };
};

describe('/api/auth/forgot-password route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_URL = 'https://www.golfiq.ca';
    mockedPrisma.user.findUnique.mockResolvedValue({ email: 'golfer@example.com' });
    mockedPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    mockedPrisma.passwordResetToken.create.mockResolvedValue({ id: BigInt(1) });
    (generatePasswordResetEmail as jest.Mock).mockReturnValue({
      subject: 'Reset password',
      html: '<p>reset</p>',
      text: 'reset',
    });
    (sendEmail as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it('stores only a hash while emailing the raw reset token', async () => {
    const response = await POST(new Request('https://www.golfiq.ca/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Golfer@Example.com' }),
    }) as any);

    expect(response.status).toBe(200);
    const resetUrl = (generatePasswordResetEmail as jest.Mock).mock.calls[0][0] as string;
    const rawToken = new URL(resetUrl).searchParams.get('token');
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);

    const storedToken = mockedPrisma.passwordResetToken.create.mock.calls[0][0].data.token;
    expect(storedToken).toBe(crypto.createHash('sha256').update(rawToken!).digest('hex'));
    expect(storedToken).not.toBe(rawToken);
  });
});
