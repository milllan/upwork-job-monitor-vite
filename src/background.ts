import browser from 'webextension-polyfill';
import { storage } from './storage';
import { fetchJobs } from './api';
import { Job, JobDetails } from './types';
import { config } from './config';

// Helper to safely send a message to the popup, ignoring errors if it's closed
async function notifyPopup() {
    try {
        await browser.runtime.sendMessage({ action: 'updatePopup' });
    } catch (error) {
        // Expected error if the popup is not open.
        console.log("Could not send message to popup, probably closed.");
    }
}

function applyFilters(jobs: Job[]): Job[] {
  return jobs.map(job => {
    const title = job.title.toLowerCase();
    const country = job.clientCountry.toLowerCase();

    job.isExcluded = config.TITLE_EXCLUSION.some(term => title.includes(term));
    job.isLowPriority = config.COUNTRY_LOW_PRIORITY.some(term => country.includes(term));
    
    return job;
  });
}

// --- Core Job Check Logic ---
async function runJobCheck() {
  console.log('--- Running Job Check ---');
  await storage.setStatus('Checking...');
  await notifyPopup();
  
  try {
    const [userQuery, seenJobs, deletedJobs] = await Promise.all([
        storage.getUserQuery(),
        storage.getSeenJobs(),
        storage.getDeletedJobs(),
    ]);

    const fetchedJobs = await fetchJobs(userQuery);
    const filteredJobs = applyFilters(fetchedJobs);
    
    const newJobs = filteredJobs.filter(job => 
        job.id && !seenJobs.includes(job.id) && !deletedJobs.includes(job.id)
    );

    console.log(`Fetched: ${fetchedJobs.length}, New: ${newJobs.length}`);

    if (newJobs.length > 0) {
      const notifiableJobs = newJobs.filter(j => !j.isExcluded && !j.isLowPriority);
      if (notifiableJobs.length > 0) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `Found ${notifiableJobs.length} new Upwork Job(s)!`,
          message: notifiableJobs[0].title,
        });
        // await playNotificationSound(); // Uncomment if you have the offscreen document setup
      }
      
      const newSeenJobs = [...seenJobs, ...newJobs.map(j => j.id)].slice(-config.MAX_SEEN_JOBS);
      await storage.setSeenJobs(newSeenJobs);
    }
    
    const jobsForPopup = filteredJobs.filter(j => j.id && !deletedJobs.includes(j.id)).slice(0, 20);
    await storage.setRecentJobs(jobsForPopup);
    await storage.setStatus(`Checked. New: ${newJobs.length}`);
    await storage.setLastCheck(Date.now());
    
  } catch (error) {
    console.error('Job check failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await storage.setStatus(`Error: ${errorMessage}`);
  }
  
  // Notify popup to update
  await notifyPopup();
}

// --- Event Listeners ---
browser.runtime.onInstalled.addListener(() => {
  console.log('Extension Installed/Updated.');
  storage.setUserQuery(config.DEFAULT_QUERY); 
  browser.alarms.create(config.ALARM_NAME, {
    delayInMinutes: 0.1, // Check quickly on first install
    periodInMinutes: config.FETCH_INTERVAL_MINUTES,
  });
  runJobCheck();
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === config.ALARM_NAME) {
    runJobCheck();
  }
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'manualCheck') {
    runJobCheck();
  } 
  // Details fetching is now handled by the popup directly to simplify logic
  return false; 
});