import browser from 'webextension-polyfill';
import type { Job, JobDetails } from './types';
import { config } from './config';

/**
 * ENHANCED: Retrieves and prioritizes all potential OAuth2 API tokens from cookies.
 * This is the more robust logic from the original codebase.
 */
async function getAllPotentialApiTokens(): Promise<string[]> {
  const cookies = await browser.cookies.getAll({ domain: 'upwork.com' });
  if (!cookies) return [];

  const tokenCookies = cookies.filter(c => c.value?.startsWith('oauth2v2_'));
  
  const tokenCandidates: string[] = [];

  // 1. Prioritize 'sb' (session-bound) tokens
  const sbTokens = tokenCookies.filter(c => c.name.endsWith('sb'));
  sbTokens.forEach(c => tokenCandidates.push(c.value));

  // 2. Add other potential tokens, filtering out known non-API ones
  const otherTokens = tokenCookies.filter(c => 
    !c.name.includes('visitor') && 
    !c.name.includes('master_access_token') &&
    !tokenCandidates.includes(c.value) // Avoid duplicates
  );
  otherTokens.forEach(c => tokenCandidates.push(c.value));

  console.log(`Found ${tokenCandidates.length} potential auth tokens.`);
  return [...new Set(tokenCandidates)]; // Return unique tokens
}


/**
 * NEW: A generic GraphQL fetcher that handles token rotation.
 * All API calls will go through this function.
 */
async function fetchWithTokenRotation(alias: string, gqlQuery: { query: string, variables: object }): Promise<any> {
    const tokens = await getAllPotentialApiTokens();
    if (tokens.length === 0) {
        throw new Error('Authentication token not found. Please log in to Upwork.');
    }

    let lastError: Error | null = null;

    for (const token of tokens) {
        console.log(`Trying token ending in ...${token.slice(-6)} for alias: ${alias}`);
        try {
            const response = await fetch(`${config.GQL_ENDPOINT_BASE}?alias=${alias}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(gqlQuery),
            });

            if (response.status === 401) {
                console.warn(`Token ...${token.slice(-6)} is unauthorized (401). Trying next.`);
                lastError = new Error(`API request failed with status: ${response.status}`);
                continue; // Try the next token
            }
            
            if (!response.ok) {
                // For other errors (like 403, 500), we might want to stop and report it.
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const data = await response.json();
            if (data.errors) {
                 console.warn(`GraphQL error with token ...${token.slice(-6)}:`, data.errors);
                 lastError = new Error('GraphQL error received from server.');
                 continue; // Still might be a token issue, so try next
            }
            
            console.log(`Successfully fetched data with token ...${token.slice(-6)}`);
            return data; // Success!

        } catch (error) {
            console.error(`Request with token ...${token.slice(-6)} failed:`, error);
            lastError = error instanceof Error ? error : new Error('Unknown fetch error');
        }
    }

    // If the loop finishes without a successful request
    throw lastError || new Error('All API tokens failed.');
}


// --- API Functions (Refactored to use the new fetcher) ---

export async function fetchJobs(userQuery: string): Promise<Job[]> {
  const gqlQuery = {
    query: `
      query UserJobSearch($req: UserJobSearchV1Request!) {
        search { universalSearchNuxt { userJobSearchV1(request: $req) {
          results {
            id title description applied
            jobTile { job { ciphertext: cipherText publishTime } }
            upworkHistoryData { client { country totalSpent { amount } totalFeedback } }
            ontologySkills { prettyName: prefLabel }
          }
        }}}
      }`,
    variables: {
      req: {
        userQuery: userQuery || config.DEFAULT_QUERY,
        contractorTier: ['IntermediateLevel', 'ExpertLevel'],
        sort: 'recency',
        paging: { offset: 0, count: 20 },
      },
    },
  };

  const rawData = await fetchWithTokenRotation('userJobSearch', gqlQuery);
  const results = rawData.data?.search?.universalSearchNuxt?.userJobSearchV1?.results;
  if (!results) {
    console.warn('No job results found in API response:', rawData);
    return [];
  }
  
  return results.map((rawJob: any): Job => ({
    id: rawJob.jobTile.job.ciphertext,
    title: rawJob.title,
    url: `https://www.upwork.com/jobs/${rawJob.jobTile.job.ciphertext}`,
    postedOn: rawJob.jobTile.job.publishTime,
    budget: rawJob.jobTile.job.fixedPriceAmount ? `$${rawJob.jobTile.job.fixedPriceAmount.amount}` : 'Hourly',
    clientCountry: rawJob.upworkHistoryData.client?.country || 'N/A',
    clientRating: rawJob.upworkHistoryData.client?.totalFeedback || null,
    clientTotalSpent: rawJob.upworkHistoryData.client?.totalSpent?.amount || 0,
    skills: rawJob.ontologySkills?.map((s: any) => s.prettyName) || [],
  }));
}

export async function fetchJobDetails(jobId: string): Promise<Partial<JobDetails>> {
  const gqlQuery = {
    query: `
      query JobAuthDetailsQuery($id: ID!) {
        jobAuthDetails(id: $id) {
          opening { job { description } }
          buyer { info { stats { feedbackCount totalJobsWithHires } } }
        }
      }`,
    variables: { id: jobId, isLoggedIn: true },
  };

  const rawData = await fetchWithTokenRotation('gql-query-get-auth-job-details', gqlQuery);
  const details = rawData.data?.jobAuthDetails;
  
  return {
    description: details?.opening?.job?.description || 'No description available.',
    clientFeedbackCount: details?.buyer?.info?.stats?.feedbackCount || 0,
    clientTotalHires: details?.buyer?.info?.stats?.totalJobsWithHires || 0,
  };
}