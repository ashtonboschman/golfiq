import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createAppleClientSecret,
  getAppleProviderCredentials,
} from '@/lib/auth/appleClientSecret';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('Apple client secret configuration', () => {
  it('generates an Apple-compatible ES256 client secret', () => {
    const token = createAppleClientSecret({
      clientId: 'ca.golfiq.web',
      teamId: 'MC74YX5TAY',
      keyId: 'TESTKEY123',
      privateKey: privateKeyPem,
    });

    const payload = jwt.verify(token, publicKey, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'MC74YX5TAY',
      subject: 'ca.golfiq.web',
    });
    const header = jwt.decode(token, { complete: true })?.header;

    expect(typeof payload).toBe('object');
    expect(header).toMatchObject({ alg: 'ES256', kid: 'TESTKEY123' });
    if (typeof payload === 'object' && payload.iat && payload.exp) {
      expect(payload.exp - payload.iat).toBe(180 * 24 * 60 * 60);
    }
  });

  it('creates credentials from an escaped multiline private key', () => {
    const credentials = getAppleProviderCredentials({
      APPLE_CLIENT_ID: 'ca.golfiq.web',
      APPLE_CLIENT_SECRET: '',
      APPLE_TEAM_ID: 'MC74YX5TAY',
      APPLE_KEY_ID: 'TESTKEY123',
      APPLE_PRIVATE_KEY: privateKeyPem.replace(/\n/g, '\\n'),
      APPLE_PRIVATE_KEY_BASE64: '',
    });

    expect(credentials?.clientId).toBe('ca.golfiq.web');
    expect(credentials?.clientSecret.split('.')).toHaveLength(3);
  });

  it('supports a base64-encoded private key', () => {
    const credentials = getAppleProviderCredentials({
      APPLE_CLIENT_ID: 'ca.golfiq.web',
      APPLE_CLIENT_SECRET: '',
      APPLE_TEAM_ID: 'MC74YX5TAY',
      APPLE_KEY_ID: 'TESTKEY123',
      APPLE_PRIVATE_KEY: '',
      APPLE_PRIVATE_KEY_BASE64: Buffer.from(privateKeyPem).toString('base64'),
    });

    expect(credentials?.clientSecret.split('.')).toHaveLength(3);
  });

  it('keeps supporting an explicitly configured client secret', () => {
    expect(
      getAppleProviderCredentials({
        APPLE_CLIENT_ID: 'ca.golfiq.web',
        APPLE_CLIENT_SECRET: 'existing-secret',
        APPLE_TEAM_ID: '',
        APPLE_KEY_ID: '',
        APPLE_PRIVATE_KEY: '',
        APPLE_PRIVATE_KEY_BASE64: '',
      }),
    ).toEqual({
      clientId: 'ca.golfiq.web',
      clientSecret: 'existing-secret',
    });
  });

  it('does not enable the web provider with incomplete credentials', () => {
    expect(
      getAppleProviderCredentials({
        APPLE_CLIENT_ID: 'ca.golfiq.web',
        APPLE_CLIENT_SECRET: '',
        APPLE_TEAM_ID: 'MC74YX5TAY',
        APPLE_KEY_ID: '',
        APPLE_PRIVATE_KEY: '',
        APPLE_PRIVATE_KEY_BASE64: '',
      }),
    ).toBeNull();
  });
});
