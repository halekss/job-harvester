import { timedHealthCheck, stripHtml, type ConnectorHealth, type ContractType, type HarvestQuery, type WorkdayTarget } from "@job-harvester/core";
import { WorkdaySearchResponseSchema, WorkdayJobDetailSchema } from "./types.js";
import { USER_AGENT } from "../../lib/user-agent.js";

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
    "User-Agent": USER_AGENT,
  };
}

// JOB-32 : la réponse de liste Workday porte déjà `total` (vérifié en direct) — on boucle sur
// `offset` tant qu'il reste des pages, avec un plafond dur de sécurité. Un run live antérieur
// avait ramené exactement `rawCount === limit` (20/20) chez Valeo, preuve que le plafond
// mordait déjà en pratique sans qu'aucun signal ne le montre.
const LIST_PAGE_SIZE = 20;
const MAX_LIST_PAGES = 20;

async function fetchJobList(target: WorkdayTarget, searchText: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const response = await fetchImpl(`${cxsBaseUrl(target)}/jobs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ appliedFacets: {}, limit: LIST_PAGE_SIZE, offset, searchText }),
    });
    if (!response.ok) {
      throw new Error(`workday search failed: HTTP ${response.status}`);
    }
    const parsed = WorkdaySearchResponseSchema.parse(await response.json());
    items.push(...parsed.jobPostings);
    if (parsed.jobPostings.length === 0) break;
    offset += LIST_PAGE_SIZE;
    if (offset >= parsed.total) break;
  }
  return items;
}

// JOB-audit-2026-08-19 : jusqu'ici la requete "alternance" ramenait tout ce que
// Workday publie pour la cible, sans jamais lire query.keywords/romeCodes -
// une campagne comme alternance-data-hdf recevait donc aussi les offres
// logistique/mecanique du meme employeur. Filtre texte simple sur titre+description,
// sans dependance a une taxonomie ROME cote Workday (l'API n'en expose pas).
// Limites de mots \b obligatoires : un mot-cle court comme "BI" en simple sous-chaine
// matchait "mobility" dans le pied de page anglais Valeo present sur toutes les offres,
// ce qui laissait tout passer silencieusement (constate en re-lancant une vraie collecte).
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

// JOB-74 : l'API Workday n'expose qu'une recherche texte libre (`searchText`), pas de filtre
// structuré par type de contrat. Un seul terme fiable existe par catégorie ; "autre" (CDI/CDD,
// catégorie fourre-tout) et les jeux de contractTypes mixtes n'ont pas de terme unique fiable —
// on préfère alors ne poser aucune contrainte de recherche (tout récupérer) et laisser le
// filtre centralisé (JOB-73, en aval dans runCampaign) trancher sur le contractType inféré par
// offre, plutôt que de deviner un mot-clé qui exclurait des résultats à tort.
function searchTextForContractTypes(contractTypes: ContractType[]): string {
  if (contractTypes.length === 0) return "";
  if (contractTypes.every((type) => type === "apprentissage" || type === "professionnalisation")) return "alternance";
  if (contractTypes.every((type) => type === "stage")) return "stage";
  return "";
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
    const listItems = await fetchJobList(target, searchTextForContractTypes(query.contractTypes), fetchImpl);
    for (const item of listItems) {
      const listing = item as { externalPath?: string };
      if (!listing.externalPath) continue;
      const jobPostingInfo = await fetchJobDetail(target, listing.externalPath, fetchImpl);
      const searchableText = `${jobPostingInfo.title} ${stripHtml(jobPostingInfo.jobDescription)}`;
      if (!matchesKeywords(searchableText, query.keywords)) continue;
      yield { target, externalPath: listing.externalPath, jobPostingInfo };
    }
  }
}

export async function checkWorkdayHealth(options: WorkdayClientOptions): Promise<ConnectorHealth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  return timedHealthCheck(WORKDAY_CONNECTOR_ID, () =>
    fetchImpl(`${cxsBaseUrl(HEALTH_CHECK_TARGET)}/jobs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
    }),
  );
}
