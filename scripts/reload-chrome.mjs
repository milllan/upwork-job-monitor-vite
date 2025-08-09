import chromeLauncher from 'chrome-launcher';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const EXTENSION_PATH = path.resolve('./dist-chrome');

const chrome = await chromeLauncher.launch({
  chromeFlags: [
    \`--load-extension=\${EXTENSION_PATH}\`,
    '--remote-debugging-port=9222',
    '--disable-extensions-except=' + EXTENSION_PATH,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/chrome-extension-dev'
  ]
});

console.log(\`Ì∫Ä Chrome launched on port \${chrome.port}\`);

async function connectToChrome() {
  const res = await fetch(\`http://localhost:9222/json\`);
  const targets = await res.json();
  const extensionTarget = targets.find(t => t.type === 'background_page' || t.type === 'service_worker');

  if (!extensionTarget) {
    console.error('‚ùå Could not find extension target');
    process.exit(1);
  }

  const ws = new WebSocket(extensionTarget.webSocketDebuggerUrl);

  ws.on('open', () => {
    console.log('‚úÖ Connected to Chrome DevTools Protocol');
  });

  return ws;
}

const ws = await connectToChrome();

fs.watch(EXTENSION_PATH, { recursive: true }, () => {
  console.log('‚ôªÔ∏è Reloading extension...');
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'chrome.runtime.reload()' } }));
});
