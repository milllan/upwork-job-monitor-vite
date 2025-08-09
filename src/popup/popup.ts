import browser from 'webextension-polyfill';
import { storage } from '../storage';
import { Job } from '../types';

// DOM Elements
const statusTextEl = document.getElementById('status-text')!;
const lastCheckTextEl = document.getElementById('last-check-text')!;
const queryInputEl = document.getElementById('query-input') as HTMLInputElement;
const manualCheckBtn = document.getElementById('manual-check-btn')!;
const jobListEl = document.getElementById('job-list')!;
const jobTemplate = document.getElementById('job-item-template') as HTMLTemplateElement;

function timeAgo(date: number | null): string {
  if (!date) return 'N/A';
  const seconds = Math.floor((new Date().getTime() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return 'Just now';
}

function renderJobs(jobs: Job[]) {
  jobListEl.innerHTML = '';
  if (jobs.length === 0) {
    jobListEl.textContent = 'No recent jobs found.';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const jobEl = jobTemplate.content.cloneNode(true) as HTMLElement;
    const container = jobEl.querySelector('.job-item')!;
    
    container.classList.toggle('job-item--low-priority', job.isLowPriority);
    container.classList.toggle('job-item--excluded', job.isExcluded);

    (jobEl.querySelector('.job-item__title') as HTMLAnchorElement).href = job.url;
    (jobEl.querySelector('.job-item__title') as HTMLAnchorElement).textContent = job.title;
    jobEl.querySelector('.job-item__budget')!.textContent = job.budget;
    jobEl.querySelector('.job-item__posted-on')!.textContent = timeAgo(new Date(job.postedOn).getTime());
    jobEl.querySelector('.job-item__client')!.textContent = `Client: ${job.clientCountry} | Rating: ${job.clientRating || 'N/A'} | Spent: $${job.clientTotalSpent.toLocaleString()}`;
    jobEl.querySelector('.job-item__skills')!.textContent = `Skills: ${job.skills.join(', ')}`;

    fragment.appendChild(jobEl);
  }
  jobListEl.appendChild(fragment);
}

async function updateUI() {
  const [status, lastCheck, query, jobs] = await Promise.all([
    storage.getStatus(),
    storage.getLastCheck(),
    storage.getUserQuery(),
    storage.getRecentJobs()
  ]);
  
  statusTextEl.textContent = status;
  lastCheckTextEl.textContent = timeAgo(lastCheck);
  queryInputEl.value = query;
  renderJobs(jobs);
}

// Event Listeners
manualCheckBtn.addEventListener('click', async () => {
  await storage.setUserQuery(queryInputEl.value);
  browser.runtime.sendMessage({ action: 'manualCheck' });
});

browser.runtime.onMessage.addListener(request => {
  if (request.action === 'updatePopup') {
    updateUI();
  }
});

// Initial Load
updateUI();