import fs from 'fs';
import path from 'path';

describe('iOS live GPS capabilities', () => {
  const infoPlist = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'App', 'Info.plist'),
    'utf8',
  );
  const swiftPackage = fs.readFileSync(
    path.join(process.cwd(), 'ios', 'App', 'CapApp-SPM', 'Package.swift'),
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
});
