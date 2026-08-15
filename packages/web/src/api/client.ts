export interface OfferSummary {
  id: string;
  title: string;
  company: { name: string };
  location: { city: string };
  source: string;
  originSource?: string;
  postedAt?: string;
  contractType: string;
}

export interface OfferDetail {
  offer: OfferSummary;
  status: string;
  events: Array<{ id: string; type: string; occurredAt: string }>;
}

export async function getOffers(): Promise<OfferSummary[]> {
  const res = await fetch("/offers");
  if (!res.ok) throw new Error(`GET /offers failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.offers;
}

export async function getOfferDetail(id: string): Promise<OfferDetail> {
  const res = await fetch(`/offers/${id}`);
  if (!res.ok) throw new Error(`GET /offers/${id} failed: HTTP ${res.status}`);
  return res.json();
}

export async function postEvent(
  offerId: string,
  body: { type: string; channel?: string; notes?: string },
): Promise<void> {
  const res = await fetch(`/offers/${offerId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /offers/${offerId}/events failed: HTTP ${res.status}`);
}
