import type { ConnectorHealth, HarvestQuery, WorkdayTarget } from "@job-harvester/core";
import { WorkdaySearchResponseSchema, WorkdayJobDetailSchema } from "./types.js";

export const WORKDAY_CONNECTOR_ID = "workday";

export interface WorkdayClientOptions {
  fetchImpl?: typeof fetch;
}

const HEALTH_CHECK_TARGET: WorkdayTarget = { tenant: "valeo", site: "valeo_jobs", dc: "wd3" };

function cxsBaseUrl(target: WorkdayTarget): string {
  return `https://${target.tenant}.${target.dc}.myworkdayjobs.com/wday/cxs/${target.tenant}/${target.site}`;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "User-Agent": "job-harvester/0.1 (personal alternance watch tool)",
  };
}

async function fetchJobList(target: WorkdayTarget, searchText: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const response = await fetchImpl(`${cxsBaseUrl(target)}/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText }),
  });
  if (!response.ok) {
    throw new Error(`workday search failed: HTTP ${response.status}`);
  }
  const parsed = WorkdaySearchResponseSchema.parse(await response.json());
  return parsed.jobPostings;
}

async function fetchJobDetail(
  target: WorkdayTarget,
  externalPath: string,
  fetchImpl: typeof fetch,
): Promise<{ title: string; jobDescription: string; location?: string; jobReqId?: string; externalUrl?: string }> {
  const response = await fetchImpl(`${cxsBaseUrl(target)}${externalPath}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`workday job detail failed: HTTP ${response.status}`);
  }
  const parsed = WorkdayJobDetailSchema.parse(await response.json());
  return parsed.jobPostingInfo;
}

export async function* fetchWorkdayOffers(query: HarvestQuery, options: WorkdayClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const targets = query.targets?.workday ?? [];
  for (const target of targets) {
    const listItems = await fetchJobList(target, "alternance", fetchImpl);
    for (const item of listItems) {
      const listing = item as { externalPath?: string };
      if (!listing.externalPath) continue;
      const jobPostingInfo = await fetchJobDetail(target, listing.externalPath, fetchImpl);
      yield { target, externalPath: listing.externalPath, jobPostingInfo };
    }
  }
}

export async function checkWorkdayHealth(options: WorkdayClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${cxsBaseUrl(HEALTH_CHECK_TARGET)}/jobs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
    });
    return {
      connectorId: WORKDAY_CONNECTOR_ID,
      ok: response.ok,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      connectorId: WORKDAY_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
