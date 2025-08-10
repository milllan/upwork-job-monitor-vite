import browser from 'webextension-polyfill';
import type { Job, JobDetails } from './types';
import { config } from './config';
import { storage } from './storage';

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
 * Uses a "sticky token" strategy.
 */
async function fetchWithTokenRotation(alias: string, gqlQuery: { query: string, variables: object }): Promise<any> {
    
    // --- Phase 1: Try the last known good token ---
    const lastGoodToken = await storage.getLastGoodToken();
    if (lastGoodToken) {
        console.log(`Trying sticky token ending in ...${lastGoodToken.slice(-6)} for alias: ${alias}`);
        try {
            const response = await fetch(`${config.GQL_ENDPOINT_BASE}?alias=${alias}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lastGoodToken}` },
                body: JSON.stringify(gqlQuery),
            });

            if (response.ok) {
                const data = await response.json();
                if (!data.errors) {
                    console.log(`Sticky token ...${lastGoodToken.slice(-6)} worked!`);
                    return data; // Success with sticky token
                }
            }
            // If the request fails for any reason (401, GraphQL error, etc.), the token is bad.
            console.warn(`Sticky token ...${lastGoodToken.slice(-6)} failed. Clearing and starting full rotation.`);
            await storage.setLastGoodToken(null); // Invalidate the token

        } catch (error) {
            console.error(`Sticky token request failed:`, error);
            await storage.setLastGoodToken(null); // Invalidate on network error too
        }
    }

    // --- Phase 2: Perform full rotation if sticky token fails or doesn't exist ---
    console.log('Starting full token rotation...');
    const tokens = await getAllPotentialApiTokens();
    if (tokens.length === 0) {
        throw new Error('Authentication token not found. Please log in to Upwork.');
    }

    let lastError: Error | null = null;

    for (const token of tokens) {
        try {
            const response = await fetch(`${config.GQL_ENDPOINT_BASE}?alias=${alias}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(gqlQuery),
            });

            if (response.status === 401) {
                lastError = new Error(`Token ...${token.slice(-6)} is unauthorized.`);
                continue; // Try the next token
            }
            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const data = await response.json();
            if (data.errors) {
                 lastError = new Error('GraphQL error received from server.');
                 continue;
            }
            
            console.log(`Found new valid token ...${token.slice(-6)}. Saving as sticky token.`);
            await storage.setLastGoodToken(token); // *** SAVE THE NEW GOOD TOKEN ***
            return data; // Success!

        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown fetch error');
        }
    }

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
        paging: { offset: 0, count: 10 },
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

export async function fetchJobDetails(job: Job): Promise<JobDetails> {
  const gqlQuery = {
    query: `
      query JobAuthDetailsQuery($id: ID!) {
        jobAuthDetails(id: $id) {
          opening {
            job {
              description
              clientActivity {
                lastBuyerActivity
                totalApplicants
                totalHired
                totalInvitedToInterview
                numberOfPositionsToHire
              }
            }
            questions {
              question
            }
          }
          buyer {
            info {
              stats {
                totalAssignments
                hoursCount
                feedbackCount
                score
                totalCharges {
                  amount
                }
              }
            }
            workHistory {
              contractorInfo {
                contractorName
                ciphertext
              }
            }
          }
          applicantsBidsStats {
            avgRateBid {
              amount
            }
            minRateBid {
              amount
            }
            maxRateBid {
              amount
            }
          }
        }
      }`,
    variables: { id: job.id, isLoggedIn: true },
  };

  const rawData = await fetchWithTokenRotation('gql-query-get-auth-job-details', gqlQuery);
  const details = rawData.data?.jobAuthDetails;
  
  // Merge the fetched details with the existing job data
  return {
    ...job, // The original job summary
    description: details?.opening?.job?.description || 'No description available.',
    clientFeedbackCount: details?.buyer?.info?.stats?.feedbackCount || 0,
    clientTotalHires: details?.buyer?.info?.stats?.totalJobsWithHires || 0,
  };
}