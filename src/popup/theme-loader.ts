import browser from 'webextension-polyfill';

<<<<<<< HEAD
document.addEventListener("DOMContentLoaded", async () => {
=======
(async () => {
>>>>>>> a99addd (feat: Implement theme fixes)
  const { theme } = await browser.storage.local.get('theme');
  if (theme === 'dark') {
    // Set the attribute on the root element immediately
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
