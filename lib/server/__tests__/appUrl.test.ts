import { getServerAppUrl } from '@/lib/server/appUrl';

describe('getServerAppUrl', () => {
  const originalEnv = process.env;

  function setNodeEnv(value: string) {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    setNodeEnv('test');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses localhost only outside production', () => {
    expect(getServerAppUrl()).toBe('http://localhost:3000');
  });

  it('normalizes a configured server-only application origin', () => {
    process.env.APP_URL = 'https://www.golfiq.ca/';
    expect(getServerAppUrl()).toBe('https://www.golfiq.ca');
  });

  it('requires APP_URL in production instead of using the public fallback', () => {
    setNodeEnv('production');
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.golfiq.ca';

    expect(() => getServerAppUrl()).toThrow('APP_URL must be configured in production.');
  });

  it.each([
    'http://www.golfiq.ca',
    'https://localhost:3000',
    'https://www.golfiq.ca/path',
    'not-a-url',
  ])('rejects unsafe production APP_URL value %s', (value) => {
    setNodeEnv('production');
    process.env.APP_URL = value;

    expect(() => getServerAppUrl()).toThrow();
  });
});
