const mockPoolConstructor = jest.fn((_config?: unknown) => ({}));
const mockPrismaClientConstructor = jest.fn(() => ({}));
const mockPrismaPgConstructor = jest.fn(() => ({}));

jest.mock('pg', () => ({
  __esModule: true,
  default: { Pool: mockPoolConstructor },
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: mockPrismaClientConstructor,
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: mockPrismaPgConstructor,
}));

describe('database TLS configuration', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDatabaseCa = process.env.DB_CA_CERT;
  const originalDatabaseCaPath = process.env.DB_CA_CERT_PATH;

  beforeEach(() => {
    jest.resetModules();
    mockPoolConstructor.mockClear();
    mockPrismaClientConstructor.mockClear();
    mockPrismaPgConstructor.mockClear();
    delete (globalThis as typeof globalThis & { pool?: unknown }).pool;
    delete (globalThis as typeof globalThis & { prisma?: unknown }).prisma;
    process.env.DATABASE_URL =
      'postgresql://user:password@example.test:5432/golfiq?sslmode=verify-full&pool_size=2';
    delete process.env.DB_CA_CERT;
    delete process.env.DB_CA_CERT_PATH;
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;

    if (originalDatabaseCa === undefined) delete process.env.DB_CA_CERT;
    else process.env.DB_CA_CERT = originalDatabaseCa;

    if (originalDatabaseCaPath === undefined) delete process.env.DB_CA_CERT_PATH;
    else process.env.DB_CA_CERT_PATH = originalDatabaseCaPath;
  });

  it('passes a base64 CA directly to pg and removes conflicting URL SSL options', async () => {
    process.env.DB_CA_CERT = Buffer.from('trusted-ca').toString('base64');

    await import('@/lib/db');

    expect(mockPoolConstructor).toHaveBeenCalledTimes(1);
    const config = mockPoolConstructor.mock.calls[0][0] as {
      connectionString: string;
      max: number;
      ssl: { ca: string; rejectUnauthorized: boolean };
    };
    const connectionUrl = new URL(config.connectionString);

    expect(connectionUrl.searchParams.has('sslmode')).toBe(false);
    expect(connectionUrl.searchParams.get('pool_size')).toBe('2');
    expect(config.max).toBe(2);
    expect(config.ssl).toEqual({
      ca: 'trusted-ca',
      rejectUnauthorized: true,
    });
  });

  it('loads the tracked CA path with certificate verification enabled', async () => {
    process.env.DB_CA_CERT_PATH = 'certs/prod-ca-2021.crt';

    await import('@/lib/db');

    const config = mockPoolConstructor.mock.calls[0][0] as {
      ssl: { ca: string; rejectUnauthorized: boolean };
    };

    expect(config.ssl.ca).toContain('-----BEGIN CERTIFICATE-----');
    expect(config.ssl.rejectUnauthorized).toBe(true);
  });
});
