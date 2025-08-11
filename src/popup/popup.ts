import browser from 'webextension-polyfill';
import { storage } from '../storage';
import type { Job, JobDetails } from '../types';
import { fetchJobDetails } from '../api';

// --- App State ---
// A simple object to hold the popup's state in memory.
let state = {
  jobs: [] as Job[],
  deletedJobs: [] as string[],
  selectedJobId: null as string | null,
};

// --- Utility Functions ---

/**
 * Converts an ISO date string to a relative time string (e.g., "5m ago").
 */
function timeAgo(value: string | number | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Formats a number into a shorthand string (e.g., 10000 -> "10k+").
 */
function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `${Math.floor(amount / 1000)}k+`;
  }
  return amount.toString();
}

// --- Render Functions ---

/**
 * Renders the entire list of jobs based on the current state.
 */
function renderJobs() {
  const jobListContainerEl = document.getElementById('job-list-container');
  const jobTemplate = document.getElementById('job-item-template') as HTMLTemplateElement;
  if (!jobListContainerEl || !jobTemplate) return;

  // Filter out jobs that are explicitly excluded or have been deleted by the user.
  const visibleJobs = state.jobs.filter(
    (job) => !job.isExcluded && !state.deletedJobs.includes(job.id)
  );

  console.log('Visible Jobs:', visibleJobs.length);
  if (visibleJobs.length === 0) {
    jobListContainerEl.innerHTML =
      '<p class="details-panel--placeholder">No recent jobs found.</p>';
    return;
  }

  jobListContainerEl.innerHTML = ''; // Clear previous content
  const fragment = document.createDocumentFragment();

  for (const job of visibleJobs) {
    const item = jobTemplate.content.cloneNode(true) as DocumentFragment;
    const container = item.querySelector('.job-item')!;

    container.dataset.jobId = job.id;
    container.classList.toggle('selected', job.id === state.selectedJobId);
    container.classList.toggle('job-item--low-priority', job.isLowPriority);

    const titleEl = container.querySelector('.job-item__title') as HTMLAnchorElement;
    titleEl.href = job.url;
    titleEl.textContent = job.title;

    // Feature: Priority Tag
    const tagEl = container.querySelector('[data-field="priority-tag"]') as HTMLElement;
    if (job.isLowPriority && job.priorityReason) {
      tagEl.textContent = job.priorityReason;
    }

    container.querySelector('[data-field="budget"]')!.textContent = job.budget.amount;
    container.querySelector('[data-field="postedOn"]')!.textContent = timeAgo(job.postedOn);

    // Feature: Client Quality Indicators
    const clientEl = container.querySelector('.job-item__client') as HTMLElement;
    clientEl.innerHTML = `
      <span>${job.client.country}</span>
      <span class="${(job.client.rating || 0) >= 4.9 ? 'client-rating--positive' : ''}">
        ⭐ ${job.client.rating ? job.client.rating.toFixed(2) : 'N/A'}
      </span>
      <span class="${job.client.totalSpent >= 10000 ? 'client-spent--high' : ''}">
        $${formatAmount(job.client.totalSpent)}
      </span>
      ${
        !job.client.paymentVerified
          ? '<span class="client-unverified" title="Payment method not verified">⚠️</span>'
          : ''
      }
    `;

    container.querySelector('[data-field="skills"]')!.textContent =
      `Skills: ${job.skills.slice(0, 4).join(', ')}`;

    fragment.appendChild(container);
  }
  jobListContainerEl.appendChild(fragment);
}

/**
 * Renders the detailed view for a single job.
 */
function renderDetails(details: JobDetails) {
  const detailsPanelEl = document.getElementById('details-panel');
  if (!detailsPanelEl) return;

  const client = details.clientStats;
  const activity = details.activity;

  detailsPanelEl.innerHTML = `
    <h3><a href="${details.url}" target="_blank">${details.title}</a></h3>
    <p><strong>Budget:</strong> ${details.budget.amount}</p>

    <div class="details-section">
      <h4>Client</h4>
      <div class="details-stats">
        <div class="details-stat"><b>⭐ ${client.feedbackScore.toFixed(2)}</b> (${
          client.feedbackCount
        } reviews)</div>
        <div class="details-stat"><b>$${formatAmount(client.totalSpent)}</b> Total Spent</div>
        <div class="details-stat"><b>${client.jobsPosted}</b> Jobs Posted</div>
        <div class="details-stat"><b>${client.totalHires}</b> Total Hires</div>
      </div>
    </div>

    <div class="details-section">
      <h4>Activity on This Job</h4>
      <div class="details-stats">
        <div class="details-stat"><b>${activity.applicants}</b> Applicants</div>
        <div class="details-stat"><b>${activity.interviewing}</b> Interviewing</div>
        <div class="details-stat"><b>${activity.invitesSent}</b> Invites Sent</div>
        <div class="details-stat"><b>Last Viewed</b> ${timeAgo(activity.lastViewed)}</div>
      </div>
    </div>

    <div class="details-section">
      <h4>Description</h4>
      <p>${details.description.replace(/\n/g, '<br>')}</p>
    </div>
  `;
}

/**
 * Fetches all necessary data from storage and updates the entire UI.
 */
async function updateUI() {
  const [status, lastCheck, query, jobs, deletedJobs, theme] = await Promise.all([
    storage.getStatus(),
    storage.getLastCheck(),
    storage.getUserQuery(),
    storage.getRecentJobs(),
    storage.getDeletedJobs(),
    storage.getTheme(),
  ]);

  // Update header elements
  document.getElementById('status-text')!.textContent = status;
  document.getElementById('last-check-text')!.textContent = timeAgo(lastCheck);
  (document.getElementById('query-input') as HTMLInputElement)!.value = query;

  // Update local state and re-render
  state.jobs = jobs;
  state.deletedJobs = deletedJobs;
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle-btn')!.textContent = theme === 'light' ? '🌙' : '☀️';
  renderJobs();
}

/**
 * Applies a theme and saves it to storage.
 */
async function applyTheme(theme: 'light' | 'dark') {
  await storage.setTheme(theme);
  // This is the only line needed to change the theme!
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle-btn')!.textContent = theme === 'light' ? '🌙' : '☀️';
}

// --- Event Handlers & Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  const manualCheckBtn = document.getElementById('manual-check-btn')!;
  const themeToggleBtn = document.getElementById('theme-toggle-btn')!;
  const jobListContainerEl = document.getElementById('job-list-container')!;
  const detailsPanelEl = document.getElementById('details-panel')!;

  manualCheckBtn.addEventListener('click', async () => {
    const queryInput = document.getElementById('query-input') as HTMLInputElement;
    await storage.setUserQuery(queryInput.value);
    browser.runtime.sendMessage({ action: 'manualCheck' });
  });

  themeToggleBtn.addEventListener('click', async () => {
    const currentTheme = await storage.getTheme();
    await applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  });

  // --- Event Delegation for Job List ---
  jobListContainerEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest<HTMLElement>('.job-item__delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const jobItem = target.closest<HTMLElement>('.job-item');
      if (jobItem?.dataset.jobId) {
        const jobId = jobItem.dataset.jobId;
        state.deletedJobs.push(jobId);
        await storage.setDeletedJobs(state.deletedJobs);
        jobItem.remove(); // Immediately remove from UI
      }
    }
  });

  jobListContainerEl.addEventListener('mouseover', async (e) => {
    const jobItem = (e.target as HTMLElement).closest<HTMLElement>('.job-item');
    if (jobItem && jobItem.dataset.jobId !== state.selectedJobId) {
      state.selectedJobId = jobItem.dataset.jobId!;
      renderJobs(); // Re-render to show selection highlight

      const jobData = state.jobs.find((j) => j.id === state.selectedJobId);
      if (jobData) {
        detailsPanelEl.innerHTML = '<p class="details-panel--placeholder">Loading details...</p>';
        try {
          const details = await fetchJobDetails(state.selectedJobId);
          renderDetails(details);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          detailsPanelEl.innerHTML = `<p style="color: red;">Error fetching details: ${message}</p>`;
        }
      }
    }
  });

  // Listen for updates from the background script
  browser.runtime.onMessage.addListener((request) => {
    if (request.action === 'updatePopup') {
      updateUI();
    }
  });

  // Initial load
  updateUI();
});
