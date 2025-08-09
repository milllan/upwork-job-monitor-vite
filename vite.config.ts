import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import path from 'path';
import pkg from './package.json';

const generateManifest = (browser: 'chrome' | 'firefox') => {
  const isFirefox = browser === 'firefox';
  return {
    manifest_version: 3,
    name: 'Lean Upwork Monitor',
    version: pkg.version,
    description: 'A lean, modern extension to monitor Upwork jobs.',
    permissions: [ 'storage', 'cookies', 'alarms', 'notifications' ],
    host_permissions: ['*://*.upwork.com/*'],
    action: {
      default_popup: 'src/popup/popup.html',
      default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
    },
    icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
    background: isFirefox ? { scripts: ['src/background.ts'] } : { service_worker: 'src/background.ts' },
    ...(isFirefox && {
      browser_specific_settings: { gecko: { id: 'lean-upwork-monitor@example.com' } },
    }),
  };
};

export default defineConfig(({ mode }) => {
  const browser = (mode === 'firefox' ? 'firefox' : 'chrome') as 'chrome' | 'firefox';

  return {
    plugins: [
      webExtension({
        manifest: () => generateManifest(browser),
        assets: 'public',
        disableAutoLaunch: true, // This prevents the plugin from opening any browser
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
      sourcemap: 'inline',
    },
  };
});