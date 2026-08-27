export interface OfferSummary {
  id: string;
  title: string;
  company: { name: string };
  location: { city: string };
  source: string;
  originSource?: string;
  postedAt?: string;
  contractType: string;
  applyUrl?: string;
  canonicalUrl: string;
  nextFollowUpAt?: string | null;
  activeEvents: Record<string, string>;
  status: string;
}

export interface OfferDetail {
  offer: OfferSummary;
  status: string;
  events: Array<{ id: string; type: string; occurredAt: string }>;
}

export interface OfferFilters {
  // Scope le tableau aux offres correspondant réellement aux critères actuels de cette
  // campagne (mots-clés/contrat/localisations) — audit 2026-08-26 : le jobboard affiche la
  // recherche demandée, pas tout l'historique jamais collecté.
  campaignId?: string;
  // Sous-ensemble des localisations/types de contrat de la campagne sélectionnée, via les boutons
  // de bascule (CampaignParamToggles) — absent = pas de restriction (toute la campagne), tableau
  // vide = tout décoché (aucune offre). Sans effet si campaignId n'est pas renseigné.
  campaignLocations?: string[];
  campaignContractTypes?: string[];
}

export interface OffersPage {
  offers: OfferSummary[];
  nextCursor: string | null;
}

export async function getOffers(filters: OfferFilters = {}, cursor?: string): Promise<OffersPage> {
  const params = new URLSearchParams();
  if (filters.campaignId) params.set("campaignId", filters.campaignId);
  if (filters.campaignLocations) params.set("locations", filters.campaignLocations.join(","));
  if (filters.campaignContractTypes) params.set("contractTypes", filters.campaignContractTypes.join(","));
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  const res = await fetch(`/offers${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`GET /offers failed: HTTP ${res.status}`);
  return res.json();
}

export async function getOfferDetail(id: string): Promise<OfferDetail> {
  const res = await fetch(`/offers/${id}`);
  if (!res.ok) throw new Error(`GET /offers/${id} failed: HTTP ${res.status}`);
  return res.json();
}

export interface Campaign {
  id: string;
  name: string;
  locations: { label: string }[];
  contractTypes: string[];
}

export async function getCampaigns(): Promise<Campaign[]> {
  const res = await fetch("/campaigns");
  if (!res.ok) throw new Error(`GET /campaigns failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.campaigns;
}

export interface RunSummary {
  runId: string;
  connectorId: string;
  rawCount: number;
  normalizedCount: number;
  rejectedCount: number;
  unresolvedLocationCount: number;
  ok: boolean;
  errorMessage?: string;
}

export interface DiscoveredTarget {
  companySlug: string;
  platform: string;
  target: string | { tenant: string; site: string; dc: string };
}

export interface HarvestRunResult {
  summaries: RunSummary[];
  discoveries: { probed: number; found: DiscoveredTarget[] };
}

// Un seul jeu de critères par campagne (audit 2026-08-26) : plus de filtres ad-hoc, la collecte
// utilise toujours les mots-clés/contrat/localisations tels que définis dans campaigns.yaml.
export async function runHarvest(campaignId: string): Promise<HarvestRunResult> {
  const res = await fetch(`/harvest/${campaignId}/run`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `POST /harvest/${campaignId}/run failed: HTTP ${res.status}`);
  // discoveries est optionnel côté réponse (routes/tests qui ne le fournissent pas encore) -
  // valeur neutre par défaut plutôt qu'un accès undefined côté composant.
  return { summaries: body.summaries, discoveries: body.discoveries ?? { probed: 0, found: [] } };
}

export async function postEvent(
  offerId: string,
  body: { type: string; channel?: string; notes?: string; nextFollowUpAt?: string },
): Promise<void> {
  const res = await fetch(`/offers/${offerId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /offers/${offerId}/events failed: HTTP ${res.status}`);
}

export async function deleteEvent(offerId: string, eventId: string): Promise<void> {
  const res = await fetch(`/offers/${offerId}/events/${eventId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /offers/${offerId}/events/${eventId} failed: HTTP ${res.status}`);
}
