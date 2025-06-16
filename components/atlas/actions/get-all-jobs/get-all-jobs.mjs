import { atlasProps } from "../../common/atlas-props.mjs";
import { atlasMixin } from "../../common/atlas-base.mjs";

export default {
  key: "atlas-get-all-jobs",
  name: "Get All Job Listings", 
  description: "Retrieve ALL job listings from ATLAS using pagination",
  version: "0.0.23",
  type: "action",
  props: {
    ...atlasProps,
    pageSize: {
      type: "integer",
      label: "Page Size",
      description: "Number of jobs per page (controls chunk size)",
      default: 50,
      min: 1,
      max: 100,
      optional: true,
    },
    page: {
      type: "integer",
      label: "Starting Page",
      description: "Page number to start from",
      default: 1,
      optional: true,
    },
    search: {
      type: "string",
      label: "Search Keywords",
      description: "Keywords to search in job titles",
      optional: true,
    },
    jobGroupNames: {
      type: "string[]",
      label: "Job Group Names", 
      description: "Filter jobs by specific job groups",
      optional: true,
    },
    isFullTime: {
      type: "boolean",
      label: "Is Full Time",
      description: "Filter for full-time (true) or part-time (false) positions",
      optional: true,
    },
    workLocation: {
      type: "string",
      label: "Work Location",
      description: "Filter by work location type",
      optional: true,
      options: ["REMOTE", "ON-SITE", "HYBRID"],
    },
    maxPages: {
      type: "integer",
      label: "Max Pages Safety Limit",
      description: "Safety limit to prevent infinite loops (0 = no limit)",
      default: 100,
      optional: true,
    },
  },
  ...atlasMixin,
  async run({ $ }) {
    try {
      // Validate authentication configuration
      this.validateAuth();

      // Create ATLAS client
      const atlas = this.createAtlasClient();
      const authMethod = this.apiKey ? "API Key" : "Username/Password";

      let allJobs = [];
      let currentPage = this.page || 1;
      let pagesRetrieved = 0;
      let totalFromAPI = null;

      console.log(`Starting pagination with pageSize: ${this.pageSize}, starting from page: ${currentPage}`);

      // Loop through pages until we reach the end
      while (true) {
        const params = this.cleanParams({
          pageSize: this.pageSize,
          page: currentPage,
          search: this.search,
          job_group_names: this.jobGroupNames,
          is_full_time: this.isFullTime,
          work_location: this.workLocation,
        });

        console.log(`Fetching page ${currentPage} (jobs so far: ${allJobs.length})`);
        
        // Use the getJobs method from atlas-base.mjs
        const response = await atlas.getJobs(params);

        const responseData = response.data || response;
        let jobs = [];

        // Handle different response structures
        if (responseData && typeof responseData === 'object' && responseData.data) {
          // Paginated response with metadata
          jobs = responseData.data || [];
          
          // Capture total from first response if available
          if (pagesRetrieved === 0 && responseData.total) {
            totalFromAPI = responseData.total;
            console.log(`API reports total: ${totalFromAPI} jobs`);
          }
          
          console.log(`Page ${currentPage}: Got ${jobs.length} jobs from paginated response`);
        } else if (Array.isArray(responseData)) {
          // Direct array response
          jobs = responseData;
          console.log(`Page ${currentPage}: Got ${jobs.length} jobs from array response`);
        } else {
          console.log(`Page ${currentPage}: Unexpected response format`, responseData);
          break;
        }

        // Check if we got empty results - stop immediately
        if (!Array.isArray(jobs) || jobs.length === 0) {
          console.log(`Page ${currentPage}: No jobs returned, stopping pagination`);
          break;
        }

        // Add jobs to our collection
        allJobs.push(...jobs);
        pagesRetrieved++;
        
        console.log(`Page ${currentPage}: Added ${jobs.length} jobs. Total collected: ${allJobs.length}`);

        // If we got fewer jobs than pageSize, this is the last page - stop here
        if (jobs.length < this.pageSize) {
          console.log(`Page ${currentPage}: Got ${jobs.length} jobs (less than pageSize ${this.pageSize}), this is the last page`);
          break;
        }

        // Safety check to prevent infinite loops
        if (this.maxPages > 0 && pagesRetrieved >= this.maxPages) {
          console.log(`Reached max pages limit (${this.maxPages}), stopping`);
          break;
        }

        // Move to next page
        currentPage++;

        // Add small delay between requests to be API-friendly
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const finalCount = allJobs.length;
      
      // Determine if we got everything
      const isComplete = totalFromAPI ? (finalCount >= totalFromAPI) : true;
      const completionStatus = totalFromAPI 
        ? `${finalCount} of ${totalFromAPI}` 
        : `${finalCount}`;

      $.export("$summary", `Retrieved ${completionStatus} job(s) across ${pagesRetrieved} page(s) using ${authMethod}`);
      
      return {
        success: true,
        count: finalCount,
        totalCount: totalFromAPI || finalCount,
        jobs: allJobs,
        authMethod: authMethod,
        pagination: {
          pagesRetrieved: pagesRetrieved,
          pageSize: this.pageSize,
          startingPage: this.page || 1,
          isComplete: isComplete,
          lastPageSize: allJobs.length > 0 ? (allJobs.length % this.pageSize || this.pageSize) : 0,
        },
      };
      
    } catch (error) {
      this.handleAtlasError(error, "Get all jobs with pagination");
    }
  },
};