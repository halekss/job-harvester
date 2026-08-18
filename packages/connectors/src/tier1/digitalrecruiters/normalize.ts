import {
  canonicalizeUrl,
  exactDedupKeyFromSource,
  exactDedupKeyFromUrl,
  normalizeCompanyName,
  inferContractTypeFromText,
  departmentFromPostalCode,
  type NormalizedOffer,
  type RawOffer,
} from "@job-harvester/core";
import { DigitalRecruitersRawOfferSchema } from "./types.js";
import { DIGITALRECRUITERS_CONNECTOR_ID } from "./client.js";

// The job-ads listing exposes no dedicated company-name field (only internal DR "brand"
// divisions, e.g. "DECATHLON Retail Omnichannel", not the company itself) — the target
// subdomain (`joinus.{entreprise}.fr`) is the closest proxy. Best-effort fallback, not
// authoritative: won't recover mixed-case brand names beyond simple title-casing.
function companyNameFromDomain(domain: string): string {
  const labels = domain.split(".");
  const withoutTld = labels.length > 2 ? labels.slice(0, -1) : labels;
  const meaningful = withoutTld.filter((label) => label !== "joinus" && label !== "www");
  const core = meaningful[0] ?? withoutTld[0] ?? domain;
  return core
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// JOB-31 : vérifié en direct — le slug `url` se termine systématiquement par
// "-{code postal 5 chiffres}-{ville}" (ex. "...-33300-bordeaux"), ce qui permet d'en extraire
// une localisation sans requête supplémentaire.
function parseLocationFromSlug(url: string): { postalCode?: string; citySlug?: string } {
  const match = url.match(/-(\d{5})-([a-z0-9-]+)$/i);
  if (!match) return {};
  return { postalCode: match[1], citySlug: match[2] };
}

export function normalizeDigitalRecruitersOffer(raw: RawOffer): NormalizedOffer {
  const { domain, item } = DigitalRecruitersRawOfferSchema.parse(raw.payload);
  const canonicalUrl = canonicalizeUrl(`https://${domain}/fr/annonce/${item.url}`);
  const now = new Date().toISOString();
  const companyName = companyNameFromDomain(domain);
  const sourceOfferId = String(item.job_ad_id);

  const { postalCode } = parseLocationFromSlug(item.url);
  const city = item.location ?? "";
  const contractTypeSourceText = `${item.contract ?? ""} ${item.title} ${item.job ?? ""}`;

  return {
    id: exactDedupKeyFromSource(DIGITALRECRUITERS_CONNECTOR_ID, sourceOfferId),
    source: DIGITALRECRUITERS_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl: canonicalUrl,
    title: item.title,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: city,
      city,
      postalCode,
      department: postalCode ? departmentFromPostalCode(postalCode) : undefined,
    },
    contractType: inferContractTypeFromText(contractTypeSourceText),
    romeCodes: [],
    // The job-ads listing endpoint doesn't return a description field at all (verified live) —
    // getting one would require an extra per-offer detail request, which the ticket's connector
    // budget doesn't call for. Left empty rather than fabricated; canonicalUrl still links to
    // the real offer page for anyone who wants the full text.
    descriptionText: "",
    remotePolicy: "unknown",
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: DIGITALRECRUITERS_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: item,
  };
}
