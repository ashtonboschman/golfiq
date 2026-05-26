/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('PWA manifest onboarding entry', () => {
  it('uses onboarding start_url for first-run app entry', () => {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { start_url?: string };

    expect(manifest.start_url).toBe('/onboarding?source=pwa');
  });
});

