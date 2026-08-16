import { z } from "zod";
import type { HarvestQuery, ConnectorHealth } from "@job-harvester/core";
import { FranceTravailSearchResponseSchema } from "./types.js";

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

const tokenCache = new Map<string, CachedToken>();

export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
}

async function getAccessToken(options: FranceTravailClientOptions, forceRefresh = false): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = Date.now();
  if (!forceRefresh) {
    const cached = tokenCache.get(options.clientId);
    if (cached && cached.expiresAt > now + TOKEN_EXPIRY_MARGIN_MS) {
      return cached.accessToken;
    }
  }

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
  tokenCache.set(options.clientId, { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 });
  return data.access_token;
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
    "User-Agent": "job-harvester/0.1 (personal alternance watch tool)",
  };
}

export async function* fetchFranceTravailOffers(query: HarvestQuery, options: FranceTravailClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const accessToken = await getAccessToken(options);
  const url = buildSearchUrl(query);
  const response = await fetchImpl(url, { headers: authHeaders(accessToken) });
  if (!response.ok) {
    throw new Error(`francetravail search failed: HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return;
  }
  const bodyJson = await response.json();
  const parsed = FranceTravailSearchResponseSchema.parse(bodyJson);
  for (const item of parsed.resultats) {
    // L'API renvoie tout offre matchant codeROME/departement quel que soit son type de contrat
    // (CDI/CDD inclus) — il n'existe pas de paramètre de recherche fiable pour restreindre à
    // l'alternance (vérifié en direct : `alternance=true` en query string est silencieusement
    // ignoré par l'API). Chaque offre porte en revanche un champ booléen fiable `alternance` ;
    // on filtre donc côté client, avant de yield, comme pour le connecteur smartrecruiters (JOB-28).
    const listing = item as { alternance?: boolean };
    if (listing.alternance !== true) continue;
    yield item;
  }
}

export async function checkFranceTravailHealth(options: FranceTravailClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  try {
    // JOB-26 : bypasse le cache pour forcer un vrai aller-retour réseau — sinon un token déjà
    // en cache (posé par un run de collecte récent) ferait renvoyer ok:true avec une latence
    // quasi nulle sans jamais toucher le réseau, contrairement aux autres connecteurs.
    await getAccessToken(options, true);
    return {
      connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
      ok: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
