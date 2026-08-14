import fs from 'fs';
import path from 'path';

describe('iOS native capabilities', () => {
  const infoPlist = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'App', 'Info.plist'),
    'utf8',
  );
  const swiftPackage = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'CapApp-SPM', 'Package.swift'),
    'utf8',
  );
  const entitlements = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'App', 'App.entitlements'),
    'utf8',
  );
  const xcodeProject = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'),
    'utf8',
  );

  it('declares transparent active-round background location usage', () => {
    expect(infoPlist).toContain('<key>NSLocationWhenInUseUsageDescription</key>');
    expect(infoPlist).toContain('<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>');
    expect(infoPlist).toContain('<key>UIBackgroundModes</key>');
    expect(infoPlist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>/);
    expect(infoPlist).toContain('during an active GPS round');
  });

  it('links the native background geolocation package with a portable path', () => {
    expect(swiftPackage).toContain('.product(name: "CapgoBackgroundGeolocation"');
    expect(swiftPackage).toContain('../../../node_modules/@capgo/background-geolocation');
    expect(swiftPackage).not.toContain('node_modules\\@capgo');
  });

  it('links native Google and Apple sign-in with portable package paths', () => {
    expect(swiftPackage).toContain('.product(name: "CapawesomeCapacitorGoogleSignIn"');
    expect(swiftPackage).toContain('.product(name: "CapawesomeCapacitorAppleSignIn"');
    expect(swiftPackage).toContain('../../../node_modules/@capawesome/capacitor-google-sign-in');
    expect(swiftPackage).toContain('../../../node_modules/@capawesome/capacitor-apple-sign-in');
    expect(swiftPackage).not.toContain('node_modules\\@capawesome');
  });

  it('declares Google callback configuration and the Sign in with Apple entitlement', () => {
    expect(infoPlist).toContain('<key>GIDClientID</key>');
    expect(infoPlist).toContain('$(GOOGLE_IOS_CLIENT_ID)');
    expect(infoPlist).toContain('$(GOOGLE_REVERSED_CLIENT_ID)');
    expect(entitlements).toContain('<key>com.apple.developer.applesignin</key>');
    expect(xcodeProject).toContain('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
    expect(xcodeProject).toContain('com.apple.SignInWithApple');
    expect(xcodeProject).toContain('GOOGLE_IOS_CLIENT_ID = "587068132583-vn0muhinn9kpu1c6h643r515d6i500lp.apps.googleusercontent.com";');
    expect(xcodeProject).toContain('GOOGLE_REVERSED_CLIENT_ID = "com.googleusercontent.apps.587068132583-vn0muhinn9kpu1c6h643r515d6i500lp";');
    expect(xcodeProject).not.toContain('replace-me');
  });
});
