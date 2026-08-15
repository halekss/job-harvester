import { ulid } from "ulid";
import { canonicalizeUrl, exactDedupKeyFromUrl, normalizeCompanyName, type ContractType, type NormalizedOffer, type RawOffer } from "@job-harvester/core";
import { LbaOfferSchema } from "./types.js";
import { LBA_CONNECTOR_ID } from "./client.js";

const SELF_PARTNER_LABELS = new Set(["offres_emploi_lba", "recruteurs_lba"]);

function mapContractType(types: string[]): ContractType {
  if (types.includes("Apprentissage")) return "apprentissage";
  if (types.includes("Professionnalisation")) return "professionnalisation";
  return "autre";
}

function mapOriginSource(partnerLabel: string): string | undefined {
  return SELF_PARTNER_LABELS.has(partnerLabel) ? undefined : partnerLabel;
}

// LBA only exposes a free-text address; postal code and city are parsed from its
// trailing "<code postal> <ville>" convention, falling back to the raw string.
function parseFrenchAddress(address: string): { city: string; postalCode?: string; department?: string } {
  const match = address.trim().match(/(\d{5})\s+(.+)$/);
  if (!match) return { city: address.trim() };
  // Both groups are mandatory (non-optional) in the pattern above, so a successful
  // match guarantees they are populated; noUncheckedIndexedAccess can't see that.
  const postalCode = match[1]!;
  const city = match[2]!;
  return { city: city.trim(), postalCode, department: postalCode.slice(0, 2) };
}

export function normalizeLbaOffer(raw: RawOffer): NormalizedOffer {
  const parsed = LbaOfferSchema.parse(raw.payload);
  const canonicalUrl = canonicalizeUrl(parsed.apply.url);
  const now = new Date().toISOString();
  const companyName = parsed.workplace.name ?? parsed.workplace.legal_name ?? "Entreprise inconnue";
  const { city, postalCode, department } = parseFrenchAddress(parsed.workplace.location.address);

  return {
    id: ulid(),
    source: LBA_CONNECTOR_ID,
    sourceOfferId: parsed.identifier.partner_job_id,
    originSource: mapOriginSource(parsed.identifier.partner_label),
    canonicalUrl,
    applyUrl: parsed.apply.url,
    title: parsed.offer.title,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
      siret: parsed.workplace.siret ?? undefined,
      website: parsed.workplace.website ?? undefined,
    },
    location: {
      label: parsed.workplace.location.address,
      city,
      postalCode,
      department,
      lat: parsed.workplace.location.geopoint.coordinates[1],
      lng: parsed.workplace.location.geopoint.coordinates[0],
    },
    contractType: mapContractType(parsed.contract.type),
    durationMonths: parsed.contract.duration ?? undefined,
    startDate: parsed.contract.start ?? undefined,
    romeCodes: parsed.offer.rome_codes,
    descriptionText: parsed.offer.description,
    remotePolicy: parsed.contract.remote ?? "unknown",
    postedAt: parsed.offer.publication.creation ?? undefined,
    expiresAt: parsed.offer.publication.expiration ?? undefined,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: LBA_CONNECTOR_ID, sourceOfferId: parsed.identifier.partner_job_id, canonicalUrl }],
    rawPayload: parsed,
  };
}
