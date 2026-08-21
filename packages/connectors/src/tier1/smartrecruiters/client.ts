import { timedHealthCheck, stripHtml, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { SmartRecruitersPostingDetailSchema, SmartRecruitersSearchResponseSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

export const SMARTRECRUITERS_CONNECTOR_ID = "smartrecruiters";
const BASE_URL = "https://api.smartrecruiters.com/v1/companies";
const HEALTH_CHECK_COMPANY = "MAZARS";

export interface SmartRecruitersClientOptions {
  fetchImpl?: typeof fetch;
}

function headers(): Record<string, string> {
  return { "User-Agent": USER_AGENT };
}

function isAlternanceRelevant(text: string): boolean {
  return /alternance|apprentissage|apprenti/i.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// JOB-audit-2026-08-20 : query.keywords (mots-cles de la campagne, ex. "data") n'etait jamais lu
// ici - une entreprise ciblee comme MAZARS remontait donc TOUTES ses offres en alternance, sans
// rapport avec le metier vise par la campagne. Meme filtre par limite de mot que Workday/WTTJ.
function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

// JOB-32 : vérifié en direct (`totalFound` réel de 188 chez MAZARS, `offset`/`limit` acceptés
// tels quels) — boucle jusqu'à couvrir `totalFound`, avec un plafond dur de sécurité.
const LIST_PAGE_SIZE = 50;
const MAX_LIST_PAGES = 20;

async function fetchPostingsList(company: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const response = await fetchImpl(`${BASE_URL}/${company}/postings?limit=${LIST_PAGE_SIZE}&offset=${offset}`, { headers: headers() });
    if (!response.ok) {
      throw new Error(`smartrecruiters postings list failed: HTTP ${response.status}`);
    }
    const parsed = SmartRecruitersSearchResponseSchema.parse(await response.json());
    items.push(...parsed.content);
    if (parsed.content.length === 0) break;
    offset += LIST_PAGE_SIZE;
    if (parsed.totalFound !== undefined && offset >= parsed.totalFound) break;
  }
  return items;
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
      const detail = await fetchPostingDetail(company, listing.id, fetchImpl);
      const parsedDetail = SmartRecruitersPostingDetailSchema.safeParse(detail);
      if (parsedDetail.success) {
        const searchableText = `${parsedDetail.data.name} ${stripHtml(parsedDetail.data.jobAd?.sections?.jobDescription?.text ?? "")}`;
        if (!matchesKeywords(searchableText, query.keywords)) continue;
      }
      // JOB-34 : `company` (le slug de l'entreprise ciblée) n'apparaît dans aucun champ de la
      // réponse de détail elle-même — sans lui, normalize.ts ne peut pas reconstruire une URL
      // de repli valide (`/v1/companies/{company}/postings/{id}`) si l'API omet un jour
      // `applyUrl`/`postingUrl`. On l'injecte donc dans le payload composite, comme le
      // connecteur workday le fait déjà avec `target`.
      yield { company, detail };
    }
  }
}

export async function checkSmartRecruitersHealth(options: SmartRecruitersClientOptions): Promise<ConnectorHealth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return timedHealthCheck(SMARTRECRUITERS_CONNECTOR_ID, () =>
    fetchImpl(`${BASE_URL}/${HEALTH_CHECK_COMPANY}/postings?limit=1`, { headers: headers() }),
  );
}
