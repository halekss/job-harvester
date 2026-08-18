import { timedHealthCheck, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { WttjSearchResponseSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

export const WTTJ_CONNECTOR_ID = "welcometothejungle";
const JOBS_INDEX = "wk_cms_jobs_production";

const PAGE_SIZE = 50;
const MAX_PAGES = 10;

export interface WttjCredentials {
  appId: string;
  apiKey: string;
}

export interface WttjClientOptions {
  fetchImpl?: typeof fetch;
}

export function getWttjCredentials(env: Record<string, string | undefined>): WttjCredentials | undefined {
  const appId = env.WTTJ_ALGOLIA_APP_ID;
  const apiKey = env.WTTJ_ALGOLIA_API_KEY;
  if (!appId || !apiKey) return undefined;
  return { appId, apiKey };
}

function headers(credentials: WttjCredentials): Record<string, string> {
  return {
    "x-algolia-api-key": credentials.apiKey,
    "x-algolia-application-id": credentials.appId,
    "content-type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
  };
}

function buildParams(query: HarvestQuery, page: number): string {
  const params = new URLSearchParams({
    query: query.keywords.join(" "),
    hitsPerPage: String(PAGE_SIZE),
    page: String(page),
    aroundLatLng: `${query.location.lat},${query.location.lng}`,
    aroundRadius: String(Math.round(query.location.radiusKm * 1000)),
  });
  return params.toString();
}

// JOB-31 : vérifié en direct — endpoint et format de requête confirmés par une vraie requête
// réseau capturée depuis un navigateur réel sur `welcometothejungle.com/fr/jobs` (recherche par
// mot-clé sur l'index `wk_cms_jobs_production`, avec géo-recherche `aroundLatLng`/`aroundRadius`
// testée séparément en direct). Voir docs/sources.md pour la décision de conformité complète
// (le domaine Algolia est techniquement hors périmètre du robots.txt du domaine principal, qui
// interdit `*/jobs?query=*`, tout en reproduisant la même fonctionnalité de recherche).
async function queryJobsIndex(
  query: HarvestQuery,
  page: number,
  credentials: WttjCredentials,
  fetchImpl: typeof fetch,
): Promise<{ hits: unknown[]; nbPages: number }> {
  const url = `https://${credentials.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${JOBS_INDEX}/query`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({ params: buildParams(query, page) }),
  });
  if (!response.ok) {
    throw new Error(`welcometothejungle algolia query failed: HTTP ${response.status}`);
  }
  const parsed = WttjSearchResponseSchema.parse(await response.json());
  return { hits: parsed.hits, nbPages: parsed.nbPages };
}

export async function* fetchWttjOffers(
  query: HarvestQuery,
  credentials: WttjCredentials,
  options: WttjClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { hits, nbPages } = await queryJobsIndex(query, page, credentials, fetchImpl);
    for (const hit of hits) {
      yield hit;
    }
    if (hits.length === 0 || page + 1 >= nbPages) break;
  }
}

export async function checkWttjHealth(
  credentials: WttjCredentials | undefined,
  options: WttjClientOptions,
): Promise<ConnectorHealth> {
  if (!credentials) {
    return {
      connectorId: WTTJ_CONNECTOR_ID,
      ok: false,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message: "WTTJ_ALGOLIA_APP_ID / WTTJ_ALGOLIA_API_KEY is not set",
    };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const probeQuery: HarvestQuery = {
    campaignId: "healthcheck",
    keywords: ["alternance"],
    romeCodes: [],
    location: { label: "Paris", lat: 48.8566, lng: 2.3522, radiusKm: 30 },
    contractTypes: ["apprentissage"],
  };
  const url = `https://${credentials.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${JOBS_INDEX}/query`;
  return timedHealthCheck(WTTJ_CONNECTOR_ID, () =>
    fetchImpl(url, {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({ params: buildParams(probeQuery, 0) }),
    }),
  );
}
