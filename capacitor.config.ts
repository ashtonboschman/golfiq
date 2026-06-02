import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.golfiq.ca';
const capacitorServerUrl = process.env.CAPACITOR_SERVER_URL || appUrl;

const config: CapacitorConfig = {
  appId: 'ca.golfiq.app',
  appName: 'GolfIQ',
  webDir: 'capacitor-shell',
  loggingBehavior: 'debug',
  backgroundColor: '#0F131A',
  server: {
    url: capacitorServerUrl,
    cleartext: capacitorServerUrl.startsWith('http://'),
    iosScheme: 'capacitor',
  },
};

export default config;
