import browser from 'webextension-polyfill';

(async () => {
  const { theme } = await browser.storage.local.get('theme');
  if (theme === 'dark') {
    const stylesheet = document.getElementById('theme-stylesheet') as HTMLLinkElement;
    stylesheet.href = './popup-dark.css';
  }
})();