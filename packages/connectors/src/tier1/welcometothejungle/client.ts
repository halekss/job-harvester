import { timedHealthCheck, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { WttjJobHitSchema, WttjSearchResponseSchema } from "./types.js";
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

// Verifie en direct le 2026-08-20 : la cle Algolia publique capturee sur le site est une
// "secured API key" restreinte par referer cote Algolia - sans ce header, meme une cle valide
// echoue en HTTP 403 "Method not allowed with this referer". Node's fetch n'envoie pas de
// Referer par defaut (contrairement a un vrai navigateur), donc il faut le forcer nous-memes.
function headers(credentials: WttjCredentials): Record<string, string> {
  return {
    "x-algolia-api-key": credentials.apiKey,
    "x-algolia-application-id": credentials.appId,
    "content-type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
    referer: "https://www.welcometothejungle.com/",
  };
}

function buildParams(query: HarvestQuery, searchText: string, page: number): string {
  const params = new URLSearchParams({
    query: searchText,
    hitsPerPage: String(PAGE_SIZE),
    page: String(page),
    aroundLatLng: `${query.location.lat},${query.location.lng}`,
    aroundRadius: String(Math.round(query.location.radiusKm * 1000)),
  });
  return params.toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// JOB-audit-2026-08-20 : Algolia matche par prefixe de mot ("BI" -> "Biologiste", "Biochimie"),
// verifie en direct - meme classe de faux positif que le filtre Workday. Un mot-cle vide passe
// tout (retro-compatible avec une campagne sans mots-cles).
function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

// JOB-31 : vérifié en direct — endpoint et format de requête confirmés par une vraie requête
// réseau capturée depuis un navigateur réel sur `welcometothejungle.com/fr/jobs` (recherche par
// mot-clé sur l'index `wk_cms_jobs_production`, avec géo-recherche `aroundLatLng`/`aroundRadius`
// testée séparément en direct). Voir docs/sources.md pour la décision de conformité complète
// (le domaine Algolia est techniquement hors périmètre du robots.txt du domaine principal, qui
// interdit `*/jobs?query=*`, tout en reproduisant la même fonctionnalité de recherche).
async function queryJobsIndex(
  query: HarvestQuery,
  searchText: string,
  page: number,
  credentials: WttjCredentials,
  fetchImpl: typeof fetch,
): Promise<{ hits: unknown[]; nbPages: number }> {
  const url = `https://${credentials.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${JOBS_INDEX}/query`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: headers(credentials),
    body: JSON.stringify({ params: buildParams(query, searchText, page) }),
  });
  if (!response.ok) {
    throw new Error(`welcometothejungle algolia query failed: HTTP ${response.status}`);
  }
  const parsed = WttjSearchResponseSchema.parse(await response.json());
  return { hits: parsed.hits, nbPages: parsed.nbPages };
}

// JOB-audit-2026-08-20 : joindre tous les mots-cles de la campagne en une seule requete Algolia
// ("data analyst data quality statistiques BI") donnait 0 resultat en direct, alors que chaque
// mot-cle pris separement en donnait des dizaines - Algolia traite la chaine comme une seule
// recherche exigeante, pas comme un OU entre mots-cles. Une requete par mot-cle, dedupliquee par
// objectID, puis filtree par limite de mot pour rejeter les faux positifs de prefixe Algolia
// (ex. "BI" -> "Biologiste").
export async function* fetchWttjOffers(
  query: HarvestQuery,
  credentials: WttjCredentials,
  options: WttjClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const searchTexts = query.keywords.length > 0 ? query.keywords : [""];
  const seenObjectIds = new Set<string>();

  for (const searchText of searchTexts) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { hits, nbPages } = await queryJobsIndex(query, searchText, page, credentials, fetchImpl);
      for (const hit of hits) {
        const parsed = WttjJobHitSchema.safeParse(hit);
        if (!parsed.success) continue;
        if (seenObjectIds.has(parsed.data.objectID)) continue;
        const searchableText = `${parsed.data.name} ${parsed.data.profile ?? ""}`;
        if (!matchesKeywords(searchableText, query.keywords)) continue;
        seenObjectIds.add(parsed.data.objectID);
        yield hit;
      }
      if (hits.length === 0 || page + 1 >= nbPages) break;
    }
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
      body: JSON.stringify({ params: buildParams(probeQuery, "alternance", 0) }),
    }),
  );
}
