import { timedHealthCheck, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { DigitalRecruitersSearchResponseSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

export const DIGITALRECRUITERS_CONNECTOR_ID = "digitalrecruiters";
const BASE_URL = "https://api.digitalrecruiters.com/public/v1/careers-site";
// JOB-31 : vérifié en direct — Decathlon (`joinus.decathlon.fr`) tourne bien sur DigitalRecruiters.
const HEALTH_CHECK_DOMAIN = "joinus.decathlon.fr";

// JOB-31 : le ticket d'origine envisageait de parser le bloc `window.__NUXT__` de la page HTML
// `/fr/annonces`. Vérifié en direct sur `joinus.decathlon.fr` : ce bloc SSR ne porte QUE la
// configuration de la page (thème, i18n, `jobAds:{jobAds:[],count:void 0,...}` vide) — la liste
// d'offres est chargée après coup côté client via un appel XHR distinct vers cette même route
// publique JSON (capturée en direct via les devtools réseau d'un navigateur réel). C'est plus
// simple et plus robuste que de parser du HTML/JS : un seul appel JSON, sans dépendance à la
// structure de rendu Nuxt (qui peut changer à chaque build), donne déjà tous les champs
// nécessaires à la normalisation (titre, contrat, ville, url) sans requête de détail par offre.
const LIST_PAGE_SIZE = 50;
const MAX_LIST_PAGES = 20;

export interface DigitalRecruitersClientOptions {
  fetchImpl?: typeof fetch;
}

function headers(): Record<string, string> {
  return { "User-Agent": USER_AGENT, "Content-Type": "application/json" };
}

async function fetchJobAdsPage(domain: string, page: number, fetchImpl: typeof fetch): Promise<unknown[]> {
  const url = `${BASE_URL}/job-ads?domainName=${encodeURIComponent(domain)}&limit=${LIST_PAGE_SIZE}&page=${page}&locale=fr_FR`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ filters: {}, coordinates: { lat: 0, lng: 0 } }),
  });
  if (!response.ok) {
    throw new Error(`digitalrecruiters job-ads request failed: HTTP ${response.status}`);
  }
  const parsed = DigitalRecruitersSearchResponseSchema.parse(await response.json());
  return parsed.items;
}

export async function* fetchDigitalRecruitersOffers(
  query: HarvestQuery,
  options: DigitalRecruitersClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const domains = query.targets?.digitalRecruiters ?? [];

  for (const domain of domains) {
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      let items: unknown[];
      try {
        items = await fetchJobAdsPage(domain, page, fetchImpl);
      } catch (error) {
        console.warn(`digitalrecruiters: skipping ${domain} — ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      if (items.length === 0) break;
      for (const item of items) {
        yield { domain, item };
      }
      if (items.length < LIST_PAGE_SIZE) break;
    }
  }
}

export async function checkDigitalRecruitersHealth(options: DigitalRecruitersClientOptions): Promise<ConnectorHealth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${BASE_URL}/job-ads?domainName=${encodeURIComponent(HEALTH_CHECK_DOMAIN)}&limit=1&page=1&locale=fr_FR`;
  return timedHealthCheck(DIGITALRECRUITERS_CONNECTOR_ID, () =>
    fetchImpl(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ filters: {}, coordinates: { lat: 0, lng: 0 } }),
    }),
  );
}
