import { storage } from '../storage';

(async () => {
  const theme = await storage.getTheme();
  if (theme === 'dark') {
    // Set the attribute on the root element immediately
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
