import browser from 'webextension-polyfill';
import { storage } from '../storage';
import { Job, JobDetails } from '../types';
import { fetchJobDetails } from '../api';

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
    const jobListContainerEl = document.getElementById('job-list-container');
    const jobTemplate = document.getElementById(
        'job-item-template'
    ) as HTMLTemplateElement;
    if (!jobListContainerEl || !jobTemplate) return; // Guard clause

    jobListContainerEl.innerHTML = '';
    const visibleJobs = state.jobs.filter(
        (job) => !state.deletedJobs.includes(job.id)
    );

    if (visibleJobs.length === 0) {
        jobListContainerEl.innerHTML =
            '<p class="details-panel--placeholder">No recent jobs found.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const job of visibleJobs) {
        const jobItemClone = jobTemplate.content.cloneNode(
            true
        ) as DocumentFragment;
        const container = jobItemClone.querySelector('.job-item')!;

        container.dataset.jobId = job.id;
        container.classList.toggle('job-item--low-priority', job.isLowPriority);
        container.classList.toggle('job-item--excluded', job.isExcluded);
        container.classList.toggle('selected', job.id === state.selectedJobId);

        const titleEl = container.querySelector(
            '.job-item__title'
        ) as HTMLAnchorElement;
        titleEl.href = job.url;
        titleEl.textContent = job.title;

        container.querySelector('[data-field="budget"]')!.textContent =
            job.budget;
        container.querySelector('[data-field="postedOn"]')!.textContent =
            timeAgo(new Date(job.postedOn).getTime());
        container.querySelector('[data-field="client"]')!.textContent =
            `Client: ${job.clientCountry} | Rating: ${job.clientRating || 'N/A'} | Spent: $${job.clientTotalSpent.toLocaleString()}`;
        container.querySelector('[data-field="skills"]')!.textContent =
            `Skills: ${job.skills.slice(0, 5).join(', ')}`;

        fragment.appendChild(container);
    }
    jobListContainerEl.appendChild(fragment);
}

function renderDetails(details: JobDetails) {
    const detailsPanelEl = document.getElementById('details-panel');
    if (!detailsPanelEl) return;

    detailsPanelEl.innerHTML = `
        <h3>${details.title}</h3>
        <p><strong>Budget:</strong> ${details.budget}</p>
        <p>
            <strong>Client:</strong> ${details.clientCountry} | 
            <strong>Rating:</strong> ${details.clientRating || 'N/A'} (${details.clientFeedbackCount} reviews) | 
            <strong>Hires:</strong> ${details.clientTotalHires}
        </p>
        <hr>
        <div>${details.description.replace(/\n/g, '<br>')}</div>
    `;
}

async function setAndApplyTheme(theme: 'light' | 'dark') {
    await storage.setTheme(theme);
    const themeStylesheet = document.getElementById(
        'theme-stylesheet'
    ) as HTMLLinkElement | null;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    if (themeStylesheet) themeStylesheet.href = `./popup-${theme}.css`;
    if (themeToggleBtn)
        themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
}

async function updateUI() {
    const [status, lastCheck, query, jobs, deletedJobs, theme] =
        await Promise.all([
            storage.getStatus(),
            storage.getLastCheck(),
            storage.getUserQuery(),
            storage.getRecentJobs(),
            storage.getDeletedJobs(),
            storage.getTheme(),
        ]);

    const statusTextEl = document.getElementById('status-text');
    const lastCheckTextEl = document.getElementById('last-check-text');
    const queryInputEl = document.getElementById(
        'query-input'
    ) as HTMLInputElement | null;
    const themeStylesheet = document.getElementById(
        'theme-stylesheet'
    ) as HTMLLinkElement | null;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    if (statusTextEl) statusTextEl.textContent = status;
    if (lastCheckTextEl) lastCheckTextEl.textContent = timeAgo(lastCheck);
    if (queryInputEl) queryInputEl.value = query;

    state.jobs = jobs;
    state.deletedJobs = deletedJobs;

    if (themeStylesheet) themeStylesheet.href = `./popup-${theme}.css`;
    if (themeToggleBtn)
        themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';

    renderJobs();
}

/**
 * Applies a theme and saves it to storage.
 */
async function setAndApplyTheme(theme: 'light' | 'dark') {
    await storage.setTheme(theme);
    // This is the only line needed to change the theme!
    document.body.dataset.theme = theme;
    document.getElementById('theme-toggle-btn')!.textContent =
        theme === 'light' ? '🌙' : '☀️';
}

// --- Event Handlers & Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Make sure to apply the theme to the body once it's available
    // This handles the case where the theme-loader might have set it on <html>
    storage.getTheme().then((theme) => {
        document.body.dataset.theme = theme;
        document.getElementById('theme-toggle-btn')!.textContent =
            theme === 'light' ? '🌙' : '☀️';
    });

    document
        .getElementById('theme-toggle-btn')!
        .addEventListener('click', async () => {
            const currentTheme = await storage.getTheme();
            // No need to check the stylesheet href anymore
            await applyTheme(currentTheme === 'light' ? 'dark' : 'light');
        });

    const manualCheckBtn = document.getElementById('manual-check-btn')!;
    const themeToggleBtn = document.getElementById('theme-toggle-btn')!;
    const jobListContainerEl = document.getElementById('job-list-container')!;
    const detailsPanelEl = document.getElementById('details-panel')!;

    manualCheckBtn.addEventListener('click', async () => {
        const queryInputEl = document.getElementById(
            'query-input'
        ) as HTMLInputElement;
        await storage.setUserQuery(queryInputEl.value);
        browser.runtime.sendMessage({ action: 'manualCheck' });
    });

    themeToggleBtn.addEventListener('click', async () => {
        const currentTheme = await storage.getTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        await setAndApplyTheme(newTheme);
    });

    jobListContainerEl.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const deleteBtn = target.closest('.job-item__delete-btn');
        if (deleteBtn) {
            const jobItem = target.closest<HTMLElement>('.job-item');
            if (!jobItem) return;
            e.stopPropagation();
            const jobId = jobItem.dataset.jobId!;
            state.deletedJobs.push(jobId);
            await storage.setDeletedJobs(state.deletedJobs);
            jobItem.remove();
        }
    });

    jobListContainerEl.addEventListener('mouseover', async (e) => {
        const jobItem = (e.target as HTMLElement).closest<HTMLElement>(
            '.job-item'
        );
        if (jobItem && jobItem.dataset.jobId !== state.selectedJobId) {
            state.selectedJobId = jobItem.dataset.jobId!;
            renderJobs(); // Re-render to show selection

            const jobData = state.jobs.find(
                (j) => j.id === state.selectedJobId
            );
            if (jobData) {
                detailsPanelEl.innerHTML = '<p>Loading details...</p>';
                try {
                    const details = await fetchJobDetails(jobData);
                    renderDetails(details);
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';
                    detailsPanelEl.innerHTML = `<p style="color: red;">Error fetching details: ${message}</p>`;
                }
            }
        }
    });

    browser.runtime.onMessage.addListener((request) => {
        if (request.action === 'updatePopup') {
            updateUI();
        }
    });

    updateUI(); // Initial Load
});
