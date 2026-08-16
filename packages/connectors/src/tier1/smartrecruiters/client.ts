import type { ConnectorHealth, HarvestQuery } from "@job-harvester/core";
import { SmartRecruitersSearchResponseSchema } from "./types.js";

export const SMARTRECRUITERS_CONNECTOR_ID = "smartrecruiters";
const BASE_URL = "https://api.smartrecruiters.com/v1/companies";
const HEALTH_CHECK_COMPANY = "MAZARS";

export interface SmartRecruitersClientOptions {
  fetchImpl?: typeof fetch;
}

function headers(): Record<string, string> {
  return { "User-Agent": "job-harvester/0.1 (personal alternance watch tool)" };
}

function isAlternanceRelevant(text: string): boolean {
  return /alternance|apprentissage|apprenti/i.test(text);
}

async function fetchPostingsList(company: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const response = await fetchImpl(`${BASE_URL}/${company}/postings?limit=50`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`smartrecruiters postings list failed: HTTP ${response.status}`);
  }
  const parsed = SmartRecruitersSearchResponseSchema.parse(await response.json());
  return parsed.content;
}

async function fetchPostingDetail(company: string, id: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${BASE_URL}/${company}/postings/${id}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`smartrecruiters posting detail failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function* fetchSmartRecruitersOffers(
  query: HarvestQuery,
  options: SmartRecruitersClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const companies = query.targets?.smartrecruiters ?? [];
  for (const company of companies) {
    const list = await fetchPostingsList(company, fetchImpl);
    for (const item of list) {
      const listing = item as { id?: string; name?: string };
      if (!listing.id || !isAlternanceRelevant(listing.name ?? "")) continue;
      yield await fetchPostingDetail(company, listing.id, fetchImpl);
    }
  }
}

export async function checkSmartRecruitersHealth(options: SmartRecruitersClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${BASE_URL}/${HEALTH_CHECK_COMPANY}/postings?limit=1`, { headers: headers() });
    return {
      connectorId: SMARTRECRUITERS_CONNECTOR_ID,
      ok: response.ok,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      connectorId: SMARTRECRUITERS_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
