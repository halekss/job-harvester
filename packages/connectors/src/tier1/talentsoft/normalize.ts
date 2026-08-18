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
import { TalentsoftRawOfferSchema } from "./types.js";
import { TALENTSOFT_CONNECTOR_ID } from "./client.js";

// The RSS handler exposes no dedicated company-name field — the target domain is the closest
// proxy available. Talentsoft career domains conventionally look like `recrutement.{company}.fr`
// or `{company}.talent-soft.com`; this heuristic strips the common leading label and TLD and
// title-cases what remains. It won't recover real acronyms (e.g. "mgen" -> "Mgen", not "MGEN"),
// so it's a best-effort fallback, not an authoritative company name.
function companyNameFromDomain(domain: string): string {
  const labels = domain.split(".");
  const withoutTld = labels.length > 2 ? labels.slice(0, -1) : labels;
  const meaningful = withoutTld.filter((label) => !["recrutement", "emploi", "carrieres", "www"].includes(label));
  const core = meaningful[0] ?? withoutTld[0] ?? domain;
  return core
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// Titles are conventionally prefixed with an internal reference like "2026-5515 - " — strip it
// for a cleaner NormalizedOffer.title when present, keep the raw title otherwise.
function stripReferencePrefix(title: string): string {
  return title.replace(/^\d{4}-\d+\s*-\s*/, "").trim();
}

// JOB-31 : vérifié en direct — la catégorie qui porte l'adresse ressemble à
// "59 bis boulevard Jean Jaurès, 74500 EVIAN-LES-BAINS, france" (virgule + code postal à 5
// chiffres) ; les autres catégories (filière/métier, type de contrat) n'ont jamais ce motif.
function findAddressCategory(categories: string[]): string | undefined {
  return categories.find((category) => /,\s*\d{5}/.test(category));
}

function parseAddress(address: string): { city: string; postalCode?: string } {
  const match = address.match(/(\d{5})\s+([^,]+)/);
  if (!match) return { city: address.trim() };
  const postalCode = match[1]!;
  const city = match[2]!.trim();
  return { city, postalCode };
}

export function normalizeTalentsoftOffer(raw: RawOffer): NormalizedOffer {
  const { domain, item } = TalentsoftRawOfferSchema.parse(raw.payload);
  const canonicalUrl = canonicalizeUrl(item.link);
  const now = new Date().toISOString();
  const companyName = companyNameFromDomain(domain);

  const idOffreMatch = item.link.match(/idOffre=(\d+)/);
  const sourceOfferId = idOffreMatch?.[1] ?? item.link;

  const addressCategory = findAddressCategory(item.categories);
  const { city, postalCode } = addressCategory ? parseAddress(addressCategory) : { city: "", postalCode: undefined };

  const title = stripReferencePrefix(item.title);
  const descriptionText = stripHtml(item.description);
  const contractTypeSourceText = `${item.categories.join(" ")} ${item.title}`;

  return {
    id: exactDedupKeyFromSource(TALENTSOFT_CONNECTOR_ID, sourceOfferId),
    source: TALENTSOFT_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl: item.link,
    title,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: addressCategory ?? "",
      city,
      postalCode,
      department: postalCode ? departmentFromPostalCode(postalCode) : undefined,
    },
    contractType: inferContractTypeFromText(contractTypeSourceText),
    romeCodes: [],
    descriptionText,
    descriptionHtml: item.description,
    remotePolicy: "unknown",
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: TALENTSOFT_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: item,
  };
}
