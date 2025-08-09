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
  // Flags for UI rendering
  isLowPriority?: boolean;
  isExcluded?: boolean;
}