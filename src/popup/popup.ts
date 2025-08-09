import browser from 'webextension-polyfill';
import { storage } from '../storage';
import { Job, JobDetails } from '../types';

// DOM Elements
const statusTextEl = document.getElementById('status-text')!;
const lastCheckTextEl = document.getElementById('last-check-text')!;
const queryInputEl = document.getElementById('query-input') as HTMLInputElement;
const manualCheckBtn = document.getElementById('manual-check-btn')!;
const themeToggleBtn = document.getElementById('theme-toggle-btn')!;
const jobListContainerEl = document.getElementById('job-list-container')!;
const detailsPanelEl = document.getElementById('details-panel')!;
const jobTemplate = document.getElementById('job-item-template') as HTMLTemplateElement;

// App State (simple object, no classes)
let state = {
  jobs: [] as Job[],
  deletedJobs: [] as string[],
  selectedJobId: null as string | null,
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr).getTime();
  if (!date) return 'N/A';
  const seconds = Math.floor((new Date().getTime() - date) / 1000);
  let interval = Math.floor(seconds / 60);
  if (interval < 60) return `${interval}m ago`;
  interval = Math.floor(interval / 60);
  if (interval < 24) return `${interval}h ago`;
  interval = Math.floor(interval / 24);
  return `${interval}d ago`;
}

function renderJobs() {
  jobListContainerEl.innerHTML = '';
  const visibleJobs = state.jobs.filter(job => !state.deletedJobs.includes(job.id));
  
  if (visibleJobs.length === 0) {
    jobListContainerEl.textContent = 'No recent jobs found.';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const job of visibleJobs) {
    const jobEl = jobTemplate.content.cloneNode(true) as HTMLElement;
    const container = jobEl.querySelector('.job-item')!;
    
    container.dataset.jobId = job.id;
    container.classList.toggle('job-item--low-priority', job.isLowPriority);
    container.classList.toggle('job-item--excluded', job.isExcluded);
    container.classList.toggle('selected', job.id === state.selectedJobId);

    (container.querySelector('.job-item__title') as HTMLAnchorElement).href = job.url;
    (container.querySelector('.job-item__title') as HTMLAnchorElement).textContent = job.title;
    container.querySelector('[data-field="budget"]')!.textContent = job.budget;
    container.querySelector('[data-field="postedOn"]')!.textContent = timeAgo(job.postedOn);
    container.querySelector('[data-field="client"]')!.textContent = `Client: ${job.clientCountry} | Rating: ${job.clientRating || 'N/A'} | Spent: $${job.clientTotalSpent.toLocaleString()}`;
    container.querySelector('[data-field="skills"]')!.textContent = `Skills: ${job.skills.slice(0, 5).join(', ')}`;
    
    fragment.appendChild(container);
  }
  jobListContainerEl.appendChild(fragment);
}

function renderDetails(details: JobDetails) {
    detailsPanelEl.innerHTML = `
        <h3>${details.title}</h3>
        <p><strong>Budget:</strong> ${details.budget}</p>
        <p><strong>Client:</strong> ${details.clientCountry} | <strong>Rating:</strong> ${details.clientRating || 'N/A'} (${details.clientFeedbackCount} reviews) | <strong>Hires:</strong> ${details.clientTotalHires}</p>
        <hr>
        <p>${details.description.replace(/\n/g, '<br>')}</p>
    `;
}

async function updateUI() {
  const [status, lastCheck, query, jobs, deletedJobs] = await Promise.all([
    storage.getStatus(),
    storage.getLastCheck(),
    storage.getUserQuery(),
    storage.getRecentJobs(),
    storage.getDeletedJobs(),
  ]);
  
  statusTextEl.textContent = status;
  lastCheckTextEl.textContent = timeAgo(new Date(lastCheck!).toISOString());
  queryInputEl.value = query;
  
  state.jobs = jobs;
  state.deletedJobs = deletedJobs;
  renderJobs();
}

// --- Event Handlers ---
manualCheckBtn.addEventListener('click', async () => {
  await storage.setUserQuery(queryInputEl.value);
  browser.runtime.sendMessage({ action: 'manualCheck' });
});

themeToggleBtn.addEventListener('click', async () => {
    const currentTheme = await storage.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    await storage.setTheme(newTheme);
    (document.getElementById('theme-stylesheet') as HTMLLinkElement).href = `./popup-${newTheme}.css`;
});

jobListContainerEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const jobItem = target.closest<HTMLElement>('.job-item');
    if (!jobItem) return;

    if (target.matches('.job-item__delete-btn')) {
        const jobId = jobItem.dataset.jobId!;
        state.deletedJobs.push(jobId);
        await storage.setDeletedJobs(state.deletedJobs);
        jobItem.remove(); // Optimistic UI update
    }
});

jobListContainerEl.addEventListener('mouseover', async (e) => {
  const jobItem = (e.target as HTMLElement).closest<HTMLElement>('.job-item');
  if (jobItem && jobItem.dataset.jobId !== state.selectedJobId) {
    state.selectedJobId = jobItem.dataset.jobId!;
    renderJobs(); // Re-render to show selection
    
    const jobData = state.jobs.find(j => j.id === state.selectedJobId);
    if (jobData) {
        detailsPanelEl.innerHTML = '<p>Loading details...</p>';
        try {
            const res = await browser.runtime.sendMessage({ action: 'getJobDetails', job: jobData });
            if (res.error) throw new Error(res.error);
            renderDetails(res.details);
        } catch (error) {
            detailsPanelEl.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }
  }
});

browser.runtime.onMessage.addListener(request => {
  if (request.action === 'updatePopup') {
    updateUI();
  }
});

updateUI();