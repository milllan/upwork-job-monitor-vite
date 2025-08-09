import browser from 'webextension-polyfill';
import { storage } from '../storage';
import { Job, JobDetails } from '../types';
import { fetchJobDetails } from '../api'; // Import directly

// --- DOM Elements ---
const statusTextEl = document.getElementById('status-text')!;
const lastCheckTextEl = document.getElementById('last-check-text')!;
const queryInputEl = document.getElementById('query-input') as HTMLInputElement;
const manualCheckBtn = document.getElementById('manual-check-btn')!;
const themeToggleBtn = document.getElementById('theme-toggle-btn')!;
const jobListContainerEl = document.getElementById('job-list-container')!;
const detailsPanelEl = document.getElementById('details-panel')!;
const jobTemplate = document.getElementById('job-item-template') as HTMLTemplateElement;

// --- App State ---
let state = {
  jobs: [] as Job[],
  deletedJobs: [] as string[],
  selectedJobId: null as string | null,
};

// --- Utility ---
function timeAgo(timestamp: number | null): string {
    if (!timestamp) return 'N/A';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// --- Render Functions ---
function renderJobs() {
  jobListContainerEl.innerHTML = '';
  const visibleJobs = state.jobs.filter(job => !state.deletedJobs.includes(job.id));
  
  if (visibleJobs.length === 0) {
    jobListContainerEl.innerHTML = '<p class="details-panel--placeholder">No recent jobs found.</p>';
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

    const titleEl = container.querySelector('.job-item__title') as HTMLAnchorElement;
    titleEl.href = job.url;
    titleEl.textContent = job.title;

    container.querySelector('[data-field="budget"]')!.textContent = job.budget;
    container.querySelector('[data-field="postedOn"]')!.textContent = timeAgo(new Date(job.postedOn).getTime());
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
        <p>
            <strong>Client:</strong> ${details.clientCountry} | 
            <strong>Rating:</strong> ${details.clientRating || 'N/A'} (${details.clientFeedbackCount} reviews) | 
            <strong>Hires:</strong> ${details.clientTotalHires}
        </p>
        <hr>
        <p>${details.description.replace(/\n/g, '<br>')}</p>
    `;
}

async function updateUI() {
  const [status, lastCheck, query, jobs, deletedJobs, theme] = await Promise.all([
    storage.getStatus(),
    storage.getLastCheck(),
    storage.getUserQuery(),
    storage.getRecentJobs(),
    storage.getDeletedJobs(),
    storage.getTheme(),
  ]);
  
  statusTextEl.textContent = status;
  lastCheckTextEl.textContent = timeAgo(lastCheck);
  queryInputEl.value = query;
  
  state.jobs = jobs;
  state.deletedJobs = deletedJobs;
  (document.getElementById('theme-stylesheet') as HTMLLinkElement).href = `./popup-${theme}.css`;
  themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';

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
    themeToggleBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
});

jobListContainerEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const jobItem = target.closest<HTMLElement>('.job-item');
    const deleteBtn = target.closest<HTMLElement>('.job-item__delete-btn');
    if (!jobItem) return;

    if (deleteBtn) {
        e.stopPropagation(); // Prevent mouseover from firing
        const jobId = jobItem.dataset.jobId!;
        state.deletedJobs.push(jobId);
        await storage.setDeletedJobs(state.deletedJobs);
        jobItem.remove();
    }
});

jobListContainerEl.addEventListener('mouseover', async (e) => {
  const jobItem = (e.target as HTMLElement).closest<HTMLElement>('.job-item');
  if (jobItem && jobItem.dataset.jobId !== state.selectedJobId) {
    state.selectedJobId = jobItem.dataset.jobId!;
    renderJobs(); // Re-render to show selection styling
    
    const jobData = state.jobs.find(j => j.id === state.selectedJobId);
    if (jobData) {
        detailsPanelEl.innerHTML = '<p>Loading details...</p>';
        try {
            const details = await fetchJobDetails(state.selectedJobId);
            const fullDetails: JobDetails = { ...jobData, ...details };
            renderDetails(fullDetails);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            detailsPanelEl.innerHTML = `<p style="color: red;">Error fetching details: ${message}</p>`;
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