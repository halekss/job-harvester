import {
  canonicalizeUrl,
  exactDedupKeyFromSource,
  exactDedupKeyFromUrl,
  normalizeCompanyName,
  stripHtml,
  inferContractTypeFromText,
  departmentFromPostalCode,
  type NormalizedOffer,
  type RawOffer,
} from "@job-harvester/core";
import { JsonLdRawOfferSchema } from "./types.js";
import { JSONLD_GENERIC_CONNECTOR_ID } from "./client.js";

function sourceOfferIdFromUrl(url: string): string {
  const { pathname } = new URL(url);
  return pathname !== "/" ? pathname : url;
}

export function normalizeJsonLdOffer(raw: RawOffer): NormalizedOffer {
  const parsed = JsonLdRawOfferSchema.parse(raw.payload);
  const { pageUrl, jobPosting } = parsed;

  const applyUrl = jobPosting.url ?? pageUrl;
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const companyName = jobPosting.hiringOrganization?.name ?? "Entreprise inconnue";
  const descriptionText = stripHtml(jobPosting.description);
  const city = jobPosting.jobLocation?.address?.addressLocality ?? "";
  const postalCode = jobPosting.jobLocation?.address?.postalCode;
  const sourceOfferId = jobPosting.identifier?.value ?? sourceOfferIdFromUrl(canonicalUrl);
  const employmentType = Array.isArray(jobPosting.employmentType)
    ? jobPosting.employmentType.join(" ")
    : (jobPosting.employmentType ?? "");

  return {
    id: exactDedupKeyFromSource(JSONLD_GENERIC_CONNECTOR_ID, sourceOfferId),
    source: JSONLD_GENERIC_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl,
    title: jobPosting.title,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: [postalCode, city].filter(Boolean).join(" ").trim(),
      city,
      postalCode,
      department: postalCode ? departmentFromPostalCode(postalCode) : undefined,
    },
    contractType: inferContractTypeFromText(`${jobPosting.title} ${descriptionText} ${employmentType}`),
    romeCodes: [],
    descriptionText,
    descriptionHtml: jobPosting.description,
    remotePolicy: "unknown",
    postedAt: jobPosting.datePosted,
    expiresAt: jobPosting.validThrough,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: JSONLD_GENERIC_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: parsed,
  };
}
