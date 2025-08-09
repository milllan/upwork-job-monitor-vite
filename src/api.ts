import browser from 'webextension-polyfill';
import type { Job, JobDetails } from './types';
import { config } from './config'; // Import the new config

// Find the OAuth2 token from cookies
async function getAuthToken(): Promise<string | null> {
  const cookies = await browser.cookies.getAll({ domain: 'upwork.com' });
  // This heuristic is good, but might need to be expanded if tokens change
  const oauthCookie = cookies.find(c => c.name.endsWith('sb') && c.value.startsWith('oauth2v2_'));
  return oauthCookie ? oauthCookie.value : null;
}

// The GraphQL query to fetch jobs
const buildGqlQuery = (userQuery: string) => ({
  query: `
    query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
      search {
        universalSearchNuxt {
          userJobSearchV1(request: $requestVariables) {
            results {
            id
            title
            description
            relevanceEncoded
            applied
            ontologySkills { uid prefLabel prettyName: prefLabel }
            jobTile { job { id ciphertext: cipherText publishTime createTime jobType hourlyBudgetMin hourlyBudgetMax fixedPriceAmount { amount isoCurrencyCode } } }
            upworkHistoryData { client { paymentVerificationStatus country totalSpent { amount } totalFeedback } }
            }
          }
        }
      }
    }`,
  variables: {
    requestVariables: {
      userQuery: userQuery || config.DEFAULT_QUERY,
      contractorTier: ['IntermediateLevel', 'ExpertLevel'],
      sort: 'recency',
      paging: { offset: 0, count: 10 },
    },
  },
});

// Main function to fetch and process jobs
export async function fetchJobs(userQuery: string): Promise<Job[]> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication token not found. Please log in to Upwork.');
  }

  const response = await fetch(config.GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(buildGqlQuery(userQuery)),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

  const rawData = await response.json();
  const results = rawData.data?.search?.universalSearchNuxt?.userJobSearchV1?.results;
  if (!results) {
    console.warn('No job results found in API response:', rawData);
    return [];
  }

  // Transform raw API data into our clean Job type
  return results.map((rawJob: any): Job => {
    const jobTile = rawJob.jobTile.job;
    const client = rawJob.upworkHistoryData.client;
    const budgetRaw = jobTile.fixedPriceAmount || jobTile.hourlyBudget; // Simplified
    return {
      id: jobTile.ciphertext,
      title: rawJob.title,
      url: `https://www.upwork.com/jobs/${jobTile.ciphertext}`,
      postedOn: jobTile.publishTime,
      budget: budgetRaw ? `$${budgetRaw.amount}` : 'N/A', // Very simplified
      clientCountry: client?.country || 'N/A',
      clientRating: client?.totalFeedback || null,
      clientTotalSpent: client?.totalSpent?.amount || 0,
      skills: rawJob.ontologySkills?.map((s: any) => s.prettyName) || [],
    };
  });
}

const buildDetailsGqlQuery = (jobId: string) => ({
    query: `
      query JobAuthDetailsQuery($id: ID!) {
        jobAuthDetails(id: $id) {
          opening { job { description } }
          buyer { info { stats { feedbackCount totalJobsWithHires } } }
        }
      }`,
    variables: { id: jobId, isLoggedIn: true },
});

export async function fetchJobDetails(job: Job): Promise<JobDetails> {
  const token = await getAuthToken();
  if (!token) throw new Error('Authentication token not found.');

  const response = await fetch(config.GQL_DETAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(buildDetailsGqlQuery(job.id)),
  });

  if (!response.ok) throw new Error(`API request for details failed: ${response.status}`);

  const rawData = await response.json();
  const details = rawData.data?.jobAuthDetails;

  return {
    ...job, // Start with the summary data
    description: details?.opening?.job?.description || 'No description available.',
    clientFeedbackCount: details?.buyer?.info?.stats?.feedbackCount || 0,
    clientTotalHires: details?.buyer?.info?.stats?.totalJobsWithHires || 0,
  };
}