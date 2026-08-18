import { z } from "zod";
import { timedHealthCheck, type HarvestQuery, type ConnectorHealth } from "@job-harvester/core";
import { FranceTravailSearchResponseSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
export const FRANCE_TRAVAIL_CONNECTOR_ID = "francetravail";

const TOKEN_SCOPE = "api_offresdemploiv2 o2dsoffre";
const TOKEN_EXPIRY_MARGIN_MS = 30_000;

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

export interface FranceTravailClientOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// JOB-25 : la clé inclut le secret, pas seulement clientId — une rotation de credentials en
// cours de vie du process invalide alors le cache par construction, au lieu de continuer à
// servir un token obtenu avec l'ancien secret jusqu'à ~25 minutes après la rotation.
function tokenCacheKey(options: FranceTravailClientOptions): string {
  return `${options.clientId}:${options.clientSecret}`;
}

const tokenCache = new Map<string, CachedToken>();
// JOB-25 : coalesce les requêtes de token concurrentes — deux appels à getAccessToken avant la
// résolution du premier partagent la même requête réseau en vol, au lieu d'en déclencher chacun
// une nouvelle.
const inFlightTokenRequests = new Map<string, Promise<string>>();

export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
  inFlightTokenRequests.clear();
}

async function requestAccessToken(options: FranceTravailClientOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(TOKEN_URL);
  url.searchParams.set("realm", "/partenaire");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scope: TOKEN_SCOPE,
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`francetravail token request failed: HTTP ${response.status}`);
  }
  const data = TokenResponseSchema.parse(await response.json());
  tokenCache.set(tokenCacheKey(options), { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

async function getAccessToken(options: FranceTravailClientOptions, forceRefresh = false): Promise<string> {
  const key = tokenCacheKey(options);
  const now = Date.now();
  if (!forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > now + TOKEN_EXPIRY_MARGIN_MS) {
      return cached.accessToken;
    }
  }

  const inFlight = inFlightTokenRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = requestAccessToken(options).finally(() => inFlightTokenRequests.delete(key));
  inFlightTokenRequests.set(key, request);
  return request;
}

// L'API n'accepte pas lat/lng en paramètre de recherche, seulement un code département.
// Les labels de localisation des campagnes contiennent le code postal (ex. "Lille 59000") ;
// on en extrait les deux premiers chiffres comme code département, sans filtre si absent.
function extractDepartement(label: string): string | undefined {
  const match = label.match(/(\d{5})/);
  return match ? match[1]!.slice(0, 2) : undefined;
}

function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL(SEARCH_URL);
  if (query.romeCodes.length > 0) {
    url.searchParams.set("codeROME", query.romeCodes.join(","));
  }
  const departement = extractDepartement(query.location.label);
  if (departement) {
    url.searchParams.set("departement", departement);
  } else {
    // JOB-23 : sans code postal dans le label de localisation, la recherche devient nationale
    // au lieu d'être géo-filtrée — un avertissement visible vaut mieux qu'une perte silencieuse.
    console.warn(
      `francetravail: aucun code postal trouvé dans le label de localisation "${query.location.label}" — recherche non filtrée par département.`,
    );
  }
  return url;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": USER_AGENT,
  };
}

// JOB-30 : vérifié en direct — l'API accepte `range=START-END` en query string (pas un header
// Range) et répond `206 Partial Content` avec un header `Content-Range: offres START-END/TOTAL`.
// 150 est la plus grande page acceptée sans erreur (vérifié en direct, `range=0-149` fonctionne,
// une page plus large n'a pas été testée mais 150 suffit largement pour ce cas d'usage).
const PAGE_SIZE = 150;
// Plafond dur de sécurité (3000 offres par recherche) — évite une boucle incontrôlée si l'API
// renvoyait un Content-Range incohérent ; jamais atteint en pratique pour une recherche par
// codeROME+département.
const MAX_PAGES = 20;

function parseContentRangeTotal(header: string | null): number | undefined {
  // Format observé en direct : "offres 0-149/1320".
  const match = header?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

export async function* fetchFranceTravailOffers(query: HarvestQuery, options: FranceTravailClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const accessToken = await getAccessToken(options);
  const baseUrl = buildSearchUrl(query);

  let start = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pagedUrl = new URL(baseUrl);
    pagedUrl.searchParams.set("range", `${start}-${start + PAGE_SIZE - 1}`);

    const response = await fetchImpl(pagedUrl, { headers: authHeaders(accessToken) });
    if (response.status === 204) {
      return;
    }
    if (!response.ok) {
      throw new Error(`francetravail search failed: HTTP ${response.status}`);
    }
    const bodyJson = await response.json();
    const parsed = FranceTravailSearchResponseSchema.parse(bodyJson);
    for (const item of parsed.resultats) {
      // L'API renvoie toute offre matchant codeROME/departement quel que soit son type de
      // contrat (CDI/CDD inclus) — il n'existe pas de paramètre de recherche fiable pour
      // restreindre à l'alternance (vérifié en direct : `alternance=true` en query string est
      // silencieusement ignoré par l'API). Chaque offre porte en revanche un champ booléen
      // fiable `alternance` ; on filtre donc côté client, avant de yield, comme pour le
      // connecteur smartrecruiters (JOB-28).
      const listing = item as { alternance?: boolean };
      if (listing.alternance !== true) continue;
      yield item;
    }

    if (parsed.resultats.length === 0) return;
    const total = parseContentRangeTotal(response.headers.get("content-range"));
    start += PAGE_SIZE;
    if (total !== undefined && start >= total) return;
  }
}

export async function checkFranceTravailHealth(options: FranceTravailClientOptions): Promise<ConnectorHealth> {
  // JOB-26 : bypasse le cache pour forcer un vrai aller-retour réseau — sinon un token déjà en
  // cache (posé par un run de collecte récent) ferait renvoyer ok:true avec une latence quasi
  // nulle sans jamais toucher le réseau, contrairement aux autres connecteurs. Le probe ne
  // renvoie pas de `Response` (juste le token en cas de succès) : timedHealthCheck traite
  // l'absence de throw comme un succès.
  return timedHealthCheck(FRANCE_TRAVAIL_CONNECTOR_ID, () => getAccessToken(options, true));
}
