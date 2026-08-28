/** @jest-environment node */

import capacitorConfig from '@/capacitor.config';

describe('release configuration', () => {
  it('keeps Capacitor logging limited to native debug builds', () => {
    expect(capacitorConfig.loggingBehavior).toBe('debug');
  });
});
