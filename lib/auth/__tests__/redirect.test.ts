import { resolveSafeNextPath } from '@/lib/auth/redirect';

describe('resolveSafeNextPath', () => {
  it('allows internal absolute paths', () => {
    expect(resolveSafeNextPath('/post-signup')).toBe('/post-signup');
    expect(resolveSafeNextPath('/rounds/add?from=onboarding')).toBe('/rounds/add?from=onboarding');
  });

  it('rejects external and malformed paths', () => {
    expect(resolveSafeNextPath('https://evil.example.com')).toBe('/dashboard');
    expect(resolveSafeNextPath('//evil.example.com')).toBe('/dashboard');
    expect(resolveSafeNextPath('javascript:alert(1)')).toBe('/dashboard');
    expect(resolveSafeNextPath(null)).toBe('/dashboard');
  });
});

