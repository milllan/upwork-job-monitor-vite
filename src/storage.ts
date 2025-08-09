import browser from 'webextension-polyfill';
import type { Job } from './types';

// Centralize storage keys to avoid typos
export const STORAGE_KEYS = {
  SEEN_JOBS: 'seenJobs',
  USER_QUERY: 'userQuery',
  RECENT_JOBS: 'recentJobs',
  MONITOR_STATUS: 'monitorStatus',
  LAST_CHECK: 'lastCheck',
};

// Generic getter/setter for simplicity
async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  const result = await browser.storage.local.get(key);
  return (result[key] as T) ?? defaultValue;
}

async function setItem<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

// Specific functions for our app state
export const storage = {
  getSeenJobs: () => getItem<string[]>(STORAGE_KEYS.SEEN_JOBS, []),
  setSeenJobs: (ids: string[]) => setItem(STORAGE_KEYS.SEEN_JOBS, ids),

  getUserQuery: () => getItem<string>(STORAGE_KEYS.USER_QUERY, ''),
  setUserQuery: (query: string) => setItem(STORAGE_KEYS.USER_QUERY, query),

  getRecentJobs: () => getItem<Job[]>(STORAGE_KEYS.RECENT_JOBS, []),
  setRecentJobs: (jobs: Job[]) => setItem(STORAGE_KEYS.RECENT_JOBS, jobs),

  getStatus: () => getItem<string>(STORAGE_KEYS.MONITOR_STATUS, 'Initializing...'),
  setStatus: (status: string) => setItem(STORAGE_KEYS.MONITOR_STATUS, status),

  getLastCheck: () => getItem<number | null>(STORAGE_KEYS.LAST_CHECK, null),
  setLastCheck: (timestamp: number) => setItem(STORAGE_KEYS.LAST_CHECK, timestamp),
};