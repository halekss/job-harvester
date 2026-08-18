import { timedHealthCheck, type HarvestQuery, type ConnectorHealth } from "@job-harvester/core";
import { LbaSearchResponseSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

const BASE_URL = "https://api.apprentissage.beta.gouv.fr";
export const LBA_CONNECTOR_ID = "labonnealternance";

export interface LbaClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL("/api/job/v1/search", BASE_URL);
  url.searchParams.set("latitude", String(query.location.lat));
  url.searchParams.set("longitude", String(query.location.lng));
  url.searchParams.set("radius", String(query.location.radiusKm));
  if (query.romeCodes.length > 0) {
    url.searchParams.set("romes", query.romeCodes.join(","));
  }
  return url;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": USER_AGENT,
  };
}

export async function* fetchLbaOffers(query: HarvestQuery, options: LbaClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildSearchUrl(query);
  const response = await fetchImpl(url, { headers: authHeaders(options.apiKey) });
  if (!response.ok) {
    throw new Error(`labonnealternance search failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  const parsed = LbaSearchResponseSchema.parse(body);
  for (const job of parsed.jobs) {
    yield job;
  }
}

export async function checkLbaHealth(options: LbaClientOptions): Promise<ConnectorHealth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildSearchUrl({ location: { label: "Paris", lat: 48.8566, lng: 2.3522, radiusKm: 5 }, romeCodes: [] });
  return timedHealthCheck(LBA_CONNECTOR_ID, () => fetchImpl(url, { headers: authHeaders(options.apiKey) }));
}
