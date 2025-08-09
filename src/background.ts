import browser from 'webextension-polyfill';
import { storage } from './storage';
import { fetchJobs } from './api';
import { Job } from './types';

// --- Constants ---
const ALARM_NAME = 'upwork-job-check';
const FETCH_INTERVAL_MINUTES = 3;
const MAX_SEEN_JOBS = 200;

// --- Filtering Logic ---
const TITLE_EXCLUSION = ['french', 'virtual assistant', 'seo specialist'].map(s => s.toLowerCase());
const COUNTRY_LOW_PRIORITY = ['india', 'pakistan', 'bangladesh'].map(s => s.toLowerCase());

function applyFilters(jobs: Job[]): Job[] {
  return jobs.map(job => {
    const title = job.title.toLowerCase();
    const country = job.clientCountry.toLowerCase();

    job.isExcluded = TITLE_EXCLUSION.some(term => title.includes(term));
    job.isLowPriority = COUNTRY_LOW_PRIORITY.some(term => country.includes(term));
    
    return job;
  });
}

// --- Audio Playback via Offscreen Document ---
async function playNotificationSound() {
  const existingContexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existingContexts.length > 0) {
    browser.runtime.sendMessage({ action: 'playSound' });
  } else {
    await browser.offscreen.createDocument({
      url: 'src/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play notification sound for new jobs',
    });
    // The message is sent after a delay to ensure the offscreen document is ready
    setTimeout(() => browser.runtime.sendMessage({ action: 'playSound' }), 100);
  }
}

// --- Core Job Check Logic ---
async function runJobCheck() {
  console.log('Running job check...');
  await storage.setStatus('Checking...');
  try {
    const userQuery = await storage.getUserQuery();
    const fetchedJobs = await fetchJobs(userQuery);
    const filteredJobs = applyFilters(fetchedJobs);

    const seenJobs = await storage.getSeenJobs();
    const newJobs = filteredJobs.filter(job => !seenJobs.includes(job.id));

    if (newJobs.length > 0) {
      const notifiableJobs = newJobs.filter(j => !j.isExcluded && !j.isLowPriority);
      if (notifiableJobs.length > 0) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `Found ${notifiableJobs.length} new Upwork Job(s)!`,
          message: notifiableJobs[0].title,
        });
        await playNotificationSound();
      }
      
      const newSeenJobs = [...seenJobs, ...newJobs.map(j => j.id)].slice(-MAX_SEEN_JOBS);
      await storage.setSeenJobs(newSeenJobs);
    }
    
    await storage.setRecentJobs(filteredJobs.slice(0, 20)); // Store top 20 for popup
    await storage.setStatus(`Checked. New: ${newJobs.length}`);
    await storage.setLastCheck(Date.now());
    
  } catch (error) {
    console.error('Job check failed:', error);
    await storage.setStatus(`Error: ${error.message}`);
  }
  // Notify popup to update
  browser.runtime.sendMessage({ action: 'updatePopup' });
}

// --- Event Listeners ---
browser.runtime.onInstalled.addListener(async () => {
  await storage.setUserQuery(''); // Initialize with empty query
  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: FETCH_INTERVAL_MINUTES,
  });
  runJobCheck();
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    runJobCheck();
  }
});

browser.runtime.onMessage.addListener(request => {
  if (request.action === 'manualCheck') {
    runJobCheck();
  }
});