export interface Job {
  id: string;
  title: string;
  url: string;
  postedOn: string;
  budget: string;
  clientCountry: string;
  clientRating: number | null;
  clientTotalSpent: number;
  skills: string[];
  isLowPriority?: boolean;
  isExcluded?: boolean;
}

export interface JobDetails extends Job {
  description: string;
  clientFeedbackCount: number;
  clientTotalHires: number;
}