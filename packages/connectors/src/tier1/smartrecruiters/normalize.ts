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
import { SmartRecruitersRawOfferSchema } from "./types.js";
import { SMARTRECRUITERS_CONNECTOR_ID } from "./client.js";

export function normalizeSmartRecruitersOffer(raw: RawOffer): NormalizedOffer {
  const { company, detail: parsed } = SmartRecruitersRawOfferSchema.parse(raw.payload);
  const applyUrl = parsed.applyUrl ?? parsed.postingUrl ?? `https://api.smartrecruiters.com/v1/companies/${company}/postings/${parsed.id}`;
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const companyName = parsed.company?.name ?? "Entreprise inconnue";
  const descriptionText = stripHtml(parsed.jobAd?.sections?.jobDescription?.text ?? "");
  const postalCode = parsed.location?.postalCode;
  const sourceOfferId = parsed.id;

  return {
    id: exactDedupKeyFromSource(SMARTRECRUITERS_CONNECTOR_ID, sourceOfferId),
    source: SMARTRECRUITERS_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl,
    title: parsed.name,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: parsed.location?.city ?? "",
      city: parsed.location?.city ?? "",
      postalCode,
      department: postalCode ? departmentFromPostalCode(postalCode) : undefined,
    },
    contractType: inferContractTypeFromText(`${parsed.name} ${descriptionText}`),
    romeCodes: [],
    descriptionText,
    remotePolicy: "unknown",
    postedAt: parsed.releasedDate,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: SMARTRECRUITERS_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: parsed,
  };
}
