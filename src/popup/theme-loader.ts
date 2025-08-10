import browser from 'webextension-polyfill';

(async () => {
  const { theme } = await browser.storage.local.get('theme');
  if (theme === 'dark') {
    // Set the attribute on the root element immediately
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
