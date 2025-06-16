import { atlasProps } from "../../common/atlas-props.mjs";
import { atlasMixin } from "../../common/atlas-base.mjs";

export default {
  key: "atlas-get-candidates",
  name: "Get All Hired Candidates", 
  description: "Retrieve ALL hired candidates from ATLAS using pagination",
  version: "0.0.9",
  type: "action",
  props: {
    ...atlasProps,
    pageSize: {
      type: "integer",
      label: "Page Size",
      description: "Number of candidates per page (controls chunk size)",
      default: 25,
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
    startDate: {
      type: "string",
      label: "Start Date",
      description: "Start date filter (Y-m-d format, time will be set to 00:00:01)",
      optional: true,
    },
    endDate: {
      type: "string", 
      label: "End Date",
      description: "End date filter (Y-m-d format, time will be set to 23:59:59)",
      optional: true,
    },
    jobIds: {
      type: "integer[]",
      label: "Job IDs",
      description: "Array of job IDs to filter candidates by",
      optional: true,
    },
    loadWithApplication: {
      type: "boolean",
      label: "Load with Application",
      description: "Include application details (including employee info for internal applications)",
      optional: true,
    },
    loadWithDocuments: {
      type: "boolean",
      label: "Load with Documents", 
      description: "Include candidate documents (increases request time significantly)",
      optional: true,
    },
    loadWithJobCustomFields: {
      type: "boolean",
      label: "Load with Job Custom Fields",
      description: "Include custom fields with jobs",
      optional: true,
    },
    loadWithQuestionnaires: {
      type: "boolean",
      label: "Load with Questionnaires",
      description: "Include questionnaires (increases request time - recommended with pagination)",
      optional: true,
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

      // Set default start_date to 3 months ago if not provided
      let effectiveStartDate = this.startDate;
      if (!effectiveStartDate) {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 1);
        effectiveStartDate = threeMonthsAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        console.log(`No start_date provided, using default: ${effectiveStartDate} (3 months ago)`);
      }

      // Format dates to include time (Y-m-d H:i:s format required by API)
      const formattedStartDate = effectiveStartDate.includes(' ') 
        ? effectiveStartDate 
        : `${effectiveStartDate} 00:00:01`;
      
      const formattedEndDate = this.endDate 
        ? (this.endDate.includes(' ') ? this.endDate : `${this.endDate} 23:59:59`)
        : null;

      let allCandidates = [];
      let currentPage = this.page || 1;
      let pagesRetrieved = 0;
      let totalFromAPI = null;

      console.log(`Starting pagination with pageSize: ${this.pageSize}, starting from page: ${currentPage}`);
      console.log(`Date range: ${formattedStartDate} to ${formattedEndDate || 'now'}`);

      // Loop through pages until we reach the end
      while (true) {
        // Build params object, only including non-empty values
        const params = {};
        
        // Always include pagination
        params.page_size = this.pageSize;
        params.page = currentPage;
        
        // Always include start_date (either provided or default) with proper time format
        params.start_date = formattedStartDate;
        
        // Only add other optional params if they have values
        if (formattedEndDate) params.end_date = formattedEndDate;
        if (this.jobIds && this.jobIds.length > 0) params.job_ids = this.jobIds;
        if (this.loadWithApplication !== undefined) params.load_with_application = this.loadWithApplication ? 1 : 0;
        if (this.loadWithDocuments !== undefined) params.load_with_documents = this.loadWithDocuments ? 1 : 0;
        if (this.loadWithJobCustomFields !== undefined) params.load_with_job_custom_fields = this.loadWithJobCustomFields ? 1 : 0;
        if (this.loadWithQuestionnaires !== undefined) params.load_with_questionnaires = this.loadWithQuestionnaires ? 1 : 0;

        console.log(`Fetching page ${currentPage} (candidates so far: ${allCandidates.length})`);
        
        // Use the makeRequest method directly for the hired candidates endpoint
        // const response = await atlas.makeRequest({
        //   url: "/v3/hired-candidates",
        //   params,
        // });

        const response = await atlas.getCandidates(params);

        const responseData = response.data || response;
        let candidates = [];

        // Handle different response structures
        if (responseData && typeof responseData === 'object' && responseData.data) {
          // Paginated response with metadata
          candidates = responseData.data || [];
          
          // Capture total from first response if available
          if (pagesRetrieved === 0 && responseData.total) {
            totalFromAPI = responseData.total;
            console.log(`API reports total: ${totalFromAPI} hired candidates`);
          }
          
          console.log(`Page ${currentPage}: Got ${candidates.length} candidates from paginated response`);
        } else if (Array.isArray(responseData)) {
          // Direct array response (when no pagination params)
          candidates = responseData;
          console.log(`Page ${currentPage}: Got ${candidates.length} candidates from array response`);
        } else {
          console.log(`Page ${currentPage}: Unexpected response format`, responseData);
          break;
        }

        // Check if we got empty results - stop immediately
        if (!Array.isArray(candidates) || candidates.length === 0) {
          console.log(`Page ${currentPage}: No candidates returned, stopping pagination`);
          break;
        }

        // Add candidates to our collection
        allCandidates.push(...candidates);
        pagesRetrieved++;
        
        console.log(`Page ${currentPage}: Added ${candidates.length} candidates. Total collected: ${allCandidates.length}`);

        // If we got fewer candidates than pageSize, this is the last page - stop here
        if (candidates.length < this.pageSize) {
          console.log(`Page ${currentPage}: Got ${candidates.length} candidates (less than pageSize ${this.pageSize}), this is the last page`);
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

      const finalCount = allCandidates.length;
      
      // Determine if we got everything
      const isComplete = totalFromAPI ? (finalCount >= totalFromAPI) : true;
      const completionStatus = totalFromAPI 
        ? `${finalCount} of ${totalFromAPI}` 
        : `${finalCount}`;

      $.export("$summary", `Retrieved ${completionStatus} hired candidate(s) from ${formattedStartDate} across ${pagesRetrieved} page(s) using ${authMethod}`);
      
      return {
        success: true,
        count: finalCount,
        totalCount: totalFromAPI || finalCount,
        candidates: allCandidates,
        authMethod: authMethod,
        filters: {
          startDate: formattedStartDate, // Show the actual formatted date used
          endDate: formattedEndDate,
          jobIds: this.jobIds,
          loadWithApplication: this.loadWithApplication,
          loadWithDocuments: this.loadWithDocuments,
          loadWithJobCustomFields: this.loadWithJobCustomFields,
          loadWithQuestionnaires: this.loadWithQuestionnaires,
        },
        pagination: {
          pagesRetrieved: pagesRetrieved,
          pageSize: this.pageSize,
          startingPage: this.page || 1,
          isComplete: isComplete,
          lastPageSize: allCandidates.length > 0 ? (allCandidates.length % this.pageSize || this.pageSize) : 0,
        },
      };
      
    } catch (error) {
      this.handleAtlasError(error, "Get all hired candidates with pagination");
    }
  },
};