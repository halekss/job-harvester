import type { NormalizedOffer, SourceRef } from "../schemas/normalized-offer.js";
import { normalizeCompanyName } from "./company-name.js";
import { trigramSimilarity } from "./similarity.js";

export const FUZZY_MATCH_THRESHOLD = 0.6;

export function isExactDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  if (a.dedupKey === b.dedupKey) return true;
  return a.source === b.source && a.sourceOfferId === b.sourceOfferId;
}

export function isFuzzyDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  if (a.location.city.toLowerCase() !== b.location.city.toLowerCase()) return false;
  const companySimilarity = trigramSimilarity(normalizeCompanyName(a.company.name), normalizeCompanyName(b.company.name));
  const titleSimilarity = trigramSimilarity(a.title.toLowerCase(), b.title.toLowerCase());
  return companySimilarity >= FUZZY_MATCH_THRESHOLD && titleSimilarity >= FUZZY_MATCH_THRESHOLD;
}

export function isDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  return isExactDuplicate(a, b) || isFuzzyDuplicate(a, b);
}

function unionSourceRefs(a: SourceRef[], b: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const result: SourceRef[] = [];
  for (const ref of [...a, ...b]) {
    const key = `${ref.source}::${ref.sourceOfferId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

export function mergeOffers(existing: NormalizedOffer, incoming: NormalizedOffer): NormalizedOffer {
  const existingHasAggregator = Boolean(existing.originSource);
  const incomingHasAggregator = Boolean(incoming.originSource);
  const preferredApplyUrl =
    existingHasAggregator && !incomingHasAggregator
      ? (incoming.applyUrl ?? existing.applyUrl)
      : (existing.applyUrl ?? incoming.applyUrl);

  // JOB-37 : base sur `incoming`, pas `existing` — un re-harvest re-normalise systématiquement
  // avec le code le plus récent (mapping de contractType corrigé, titre/description mis à jour
  // côté source, etc.) ; figer sur `existing` gelait silencieusement une offre à l'état de sa
  // toute première collecte. Seule l'identité stable de l'enregistrement (id, provenance
  // primaire, clé de dédup, URL canonique servant à cette clé) reste ancrée sur `existing`.
  return {
    ...incoming,
    id: existing.id,
    source: existing.source,
    sourceOfferId: existing.sourceOfferId,
    dedupKey: existing.dedupKey,
    canonicalUrl: existing.canonicalUrl,
    descriptionText:
      incoming.descriptionText.length > existing.descriptionText.length ? incoming.descriptionText : existing.descriptionText,
    applyUrl: preferredApplyUrl,
    firstSeenAt: existing.firstSeenAt < incoming.firstSeenAt ? existing.firstSeenAt : incoming.firstSeenAt,
    lastSeenAt: existing.lastSeenAt > incoming.lastSeenAt ? existing.lastSeenAt : incoming.lastSeenAt,
    sourceRefs: unionSourceRefs(existing.sourceRefs, incoming.sourceRefs),
  };
}
