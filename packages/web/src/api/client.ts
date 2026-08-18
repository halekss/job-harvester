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
}

export interface OfferDetail {
  offer: OfferSummary;
  status: string;
  events: Array<{ id: string; type: string; occurredAt: string }>;
}

export interface OfferFilters {
  city?: string;
  contractType?: string;
  q?: string;
}

export interface OffersPage {
  offers: OfferSummary[];
  nextCursor: string | null;
}

export async function getOffers(filters: OfferFilters = {}, cursor?: string): Promise<OffersPage> {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  if (filters.contractType) params.set("contractType", filters.contractType);
  if (filters.q) params.set("q", filters.q);
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
}

export async function getCampaigns(): Promise<Campaign[]> {
  const res = await fetch("/campaigns");
  if (!res.ok) throw new Error(`GET /campaigns failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.campaigns;
}

export interface RunSummary {
  runId: string;
  rawCount: number;
  normalizedCount: number;
  rejectedCount: number;
  ok: boolean;
  errorMessage?: string;
}

export async function runHarvest(campaignId: string): Promise<RunSummary[]> {
  const res = await fetch(`/harvest/${campaignId}/run`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `POST /harvest/${campaignId}/run failed: HTTP ${res.status}`);
  return body.summaries;
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
