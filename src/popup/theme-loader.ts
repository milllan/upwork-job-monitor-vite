import browser from 'webextension-polyfill';

document.addEventListener('DOMContentLoaded', async () => {
  const { theme } = await browser.storage.local.get('theme');
  if (theme === 'dark') {
    const stylesheet = document.getElementById('theme-stylesheet') as HTMLLinkElement | null;
    if (stylesheet) {
      stylesheet.href = './popup-dark.css';
    }
  }
});
