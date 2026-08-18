import { timedHealthCheck, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { isAllowedByRobots } from "../../lib/robots.js";
import { extractJobPostings } from "../../lib/jsonld.js";
import { fetchRenderedHtml } from "../../lib/headless.js";
import { USER_AGENT } from "../../lib/user-agent.js";

export const JSONLD_GENERIC_CONNECTOR_ID = "jsonld-generic";

export interface JsonLdGenericClientOptions {
  fetchImpl?: typeof fetch;
}

function headers(): Record<string, string> {
  return { "User-Agent": USER_AGENT };
}

async function fetchStaticHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`jsonld-generic fetch failed: HTTP ${response.status}`);
  }
  return response.text();
}

export async function* fetchJsonLdGenericOffers(
  query: HarvestQuery,
  options: JsonLdGenericClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageUrls = query.targets?.jsonldGeneric ?? [];

  for (const pageUrl of pageUrls) {
    const allowed = await isAllowedByRobots(pageUrl, USER_AGENT, fetchImpl);
    if (!allowed) {
      console.warn(`jsonld-generic: skipping ${pageUrl} — disallowed by robots.txt`);
      continue;
    }

    let html: string;
    try {
      html = await fetchStaticHtml(pageUrl, fetchImpl);
    } catch (error) {
      console.warn(`jsonld-generic: skipping ${pageUrl} — ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    let jobPostings = extractJobPostings(html);
    if (jobPostings.length === 0) {
      // Last resort: some career pages only render their JSON-LD client-side via JS.
      const rendered = await fetchRenderedHtml(pageUrl);
      jobPostings = extractJobPostings(rendered);
    }
    if (jobPostings.length === 0) continue;

    for (const jobPosting of jobPostings) {
      yield { pageUrl, jobPosting };
    }
  }
}

export async function checkJsonLdGenericHealth(options: JsonLdGenericClientOptions): Promise<ConnectorHealth> {
  // No single fixed domain to probe — target pages are configured per campaign, not per
  // connector — so this only confirms the connector is wired up, not a specific remote endpoint.
  void options;
  return timedHealthCheck(JSONLD_GENERIC_CONNECTOR_ID, async () => true);
}
