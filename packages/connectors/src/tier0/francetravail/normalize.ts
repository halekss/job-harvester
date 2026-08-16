import { ulid } from "ulid";
import { canonicalizeUrl, exactDedupKeyFromUrl, normalizeCompanyName, type ContractType, type NormalizedOffer, type RawOffer } from "@job-harvester/core";
import { FranceTravailOfferSchema } from "./types.js";
import { FRANCE_TRAVAIL_CONNECTOR_ID } from "./client.js";

function mapContractType(natureContrat: string | undefined): ContractType {
  if (!natureContrat) return "autre";
  if (/apprentissage/i.test(natureContrat)) return "apprentissage";
  if (/professionnalisation/i.test(natureContrat)) return "professionnalisation";
  return "autre";
}

// lieuTravail.libelle suit le format "<code département> - <ville>" ; on retombe sur le
// libellé complet comme ville si le format diffère de ce à quoi s'attend l'API.
// JOB-27 : la Corse utilise littéralement "2A"/"2B" comme code département dans ce libellé
// (contrairement aux DOM, où le code postal est à 3 chiffres numériques) — sans ce cas, un
// libellé "2A - Ajaccio" ne matchait aucun des deux groupes et retombait sur le libellé complet
// comme ville, sans département.
function parseLieuTravail(libelle: string): { city: string; department?: string } {
  const match = libelle.match(/^(\d{2,3}|2[AB])\s*-\s*(.+)$/i);
  if (!match) return { city: libelle.trim() };
  return { department: match[1]!.toUpperCase(), city: match[2]!.trim() };
}

function resolveApplyUrl(parsed: ReturnType<typeof FranceTravailOfferSchema.parse>): string {
  const partner = parsed.origineOffre.partenaires?.[0];
  return partner?.url ?? parsed.origineOffre.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${parsed.id}`;
}

function resolveOriginSource(parsed: ReturnType<typeof FranceTravailOfferSchema.parse>): string | undefined {
  if (parsed.origineOffre.origine === "2") {
    return parsed.origineOffre.partenaires?.[0]?.nom;
  }
  return undefined;
}

export function normalizeFranceTravailOffer(raw: RawOffer): NormalizedOffer {
  const parsed = FranceTravailOfferSchema.parse(raw.payload);
  const applyUrl = resolveApplyUrl(parsed);
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const companyName = parsed.entreprise?.nom ?? "Entreprise inconnue";
  const { city, department } = parseLieuTravail(parsed.lieuTravail.libelle);

  return {
    id: ulid(),
    source: FRANCE_TRAVAIL_CONNECTOR_ID,
    sourceOfferId: parsed.id,
    originSource: resolveOriginSource(parsed),
    canonicalUrl,
    applyUrl,
    title: parsed.intitule,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: parsed.lieuTravail.libelle,
      city,
      postalCode: parsed.lieuTravail.codePostal,
      department,
    },
    contractType: mapContractType(parsed.natureContrat),
    romeCodes: [parsed.romeCode],
    descriptionText: parsed.description,
    remotePolicy: "unknown",
    postedAt: parsed.dateCreation,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: FRANCE_TRAVAIL_CONNECTOR_ID, sourceOfferId: parsed.id, canonicalUrl }],
    rawPayload: parsed,
  };
}
