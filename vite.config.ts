import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import path from 'path';

// Helper function to generate the manifest
const generateManifest = (browser: 'chrome' | 'firefox') => {
  const isFirefox = browser === 'firefox';

  return {
    manifest_version: 3,
    name: 'Lean Upwork Monitor',
    version: '1.0.0',
    description: 'A lean, modern extension to monitor Upwork jobs.',
    permissions: ['storage', 'cookies', 'alarms', 'notifications', 'offscreen'],
    host_permissions: ['*://*.upwork.com/*'],
    action: {
      default_popup: 'src/popup/popup.html',
      default_icon: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    },
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    background: isFirefox
      ? { scripts: ['src/background.ts'] } // Firefox uses Event Pages
      : { service_worker: 'src/background.ts' }, // Chrome uses Service Workers
    web_accessible_resources: [
      {
        resources: ['audio/notification.mp3'],
        matches: ['<all_urls>'],
      },
    ],
    // Firefox specific settings
    ...(isFirefox && {
      browser_specific_settings: {
        gecko: {
          id: 'lean-upwork-monitor@example.com',
        },
      },
    }),
  };
};

export default defineConfig(({ mode }) => {
  const browser = (mode === 'firefox' ? 'firefox' : 'chrome') as 'chrome' | 'firefox';

  return {
    plugins: [
      webExtension({
        manifest: generateManifest(browser),
        // This will copy static assets like icons and audio to the dist folder
        assets: 'public',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: true,
    },
  };
});