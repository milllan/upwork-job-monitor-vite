import browser from 'webextension-polyfill';
import { storage } from './storage';
import { fetchJobs, fetchJobDetails } from './api';
import { Job } from './types';
import { config } from './config';

// --- Helper to safely send a message to the popup ---
async function notifyPopup() {
    try {
        await browser.runtime.sendMessage({ action: 'updatePopup' });
    } catch (error) {
        // This error is expected if the popup is not open. We can safely ignore it.
        // console.log("Could not send message to popup, probably closed.");
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
  console.log('Running job check...');
  await storage.setStatus('Checking...');
  
  //browser.runtime.sendMessage({ action: 'updatePopup' }); // Notify popup we've started
  await notifyPopup(); // Notify popup we've started
  try {
    const [userQuery, seenJobs, deletedJobs] = await Promise.all([
        storage.getUserQuery(),
        storage.getSeenJobs(),
        storage.getDeletedJobs(),
    ]);

    const fetchedJobs = await fetchJobs(userQuery);
    const filteredJobs = applyFilters(fetchedJobs);

    const newJobs = filteredJobs.filter(job => 
        !seenJobs.includes(job.id) && !deletedJobs.includes(job.id) // Respect deleted jobs
    );

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
      
      const newSeenJobs = [...seenJobs, ...newJobs.map(j => j.id)].slice(-MAX_SEEN_JOBS);
      await storage.setSeenJobs(newSeenJobs);
    }
    
    await storage.setRecentJobs(filteredJobs.filter(j => !deletedJobs.includes(j.id)).slice(0, 20));
    await storage.setStatus(`Checked. New: ${newJobs.length}`);
    await storage.setLastCheck(Date.now());
    
  } catch (error) {
    console.error('Job check failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await storage.setStatus(`Error: ${errorMessage}`);
  }
  // Notify popup to update
  //browser.runtime.sendMessage({ action: 'updatePopup' });
  await notifyPopup(); // Notify popup we're done
}

// --- Event Listeners ---
browser.runtime.onInstalled.addListener(async () => {
  await storage.setUserQuery(config.DEFAULT_QUERY); 
  browser.alarms.create(config.ALARM_NAME, {
    delayInMinutes: 1,
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
  } else if (request.action === 'getJobDetails') {
    fetchJobDetails(request.job)
      .then(details => sendResponse({ details }))
      .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true; // Indicates async response
  }
});