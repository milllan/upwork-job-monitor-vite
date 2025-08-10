// src/types.ts

// This interface now includes the filter flags and richer client/budget data
export interface Job {
  id: string;
  title: string;
  url: string;
  postedOn: string;
  budget: {
    type: string;
    amount: string;
  };
  client: {
    country: string;
    rating: number | null;
    totalSpent: number;
    paymentVerified: boolean;
  };
  skills: string[];
  // Flags added by the background script
  isLowPriority?: boolean;
  isExcluded?: boolean;
  priorityReason?: string; // NEW: A reason for the tag
}

// This interface is much more detailed to match the API response
export interface JobDetails extends Job {
  description: string;
  clientStats: {
    jobsPosted: number;
    totalHires: number;
    activeContracts: number;
    totalSpent: number;
    feedbackScore: number;
    feedbackCount: number;
  };
  activity: {
    applicants: number;
    interviewing: number;
    invitesSent: number;
    lastViewed: string | null;
  };
  bidStats: {
    avg: number;
    min: number;
    max: number;
  } | null;
}
