import { departmentFromPostalCode, type ContractType, type NormalizedOffer } from "@job-harvester/core";
import type { CampaignConfig } from "./config/campaign-schema.js";

export interface AcceptableLocation {
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface QueryFilter {
  contractTypes: ContractType[];
  keywords: string[];
  acceptableLocations: AcceptableLocation[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Backstop centralisé — même logique par limite de mot que les 4 pré-filtres tier1 (déjà
// dupliqués côté connecteurs pour l'efficacité réseau), appliquée ici pour tous les
// connecteurs, y compris tier0 qui n'a aujourd'hui aucun filtre mots-clés (JOB-73, ex JOB-68).
export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
}

// Même heuristique que francetravail/client.ts (code postal 5 chiffres dans le label), mais
// réutilise departmentFromPostalCode (déjà exporté par @job-harvester/core) pour gérer
// correctement les départements DOM/TOM à 3 chiffres — francetravail/client.ts a sa propre
// version simplifiée (slice(0,2) systématique), hors scope de ce lot.
export function departmentFromLabel(label: string): string | undefined {
  const match = label.match(/(\d{5})/);
  return match ? departmentFromPostalCode(match[1]!) : undefined;
}

// Un label de localisation de campagne ("Lille 59000") sans son code postal, pour le dernier
// recours de correspondance par nom de ville (JOB-workday-location, voir resolveLocationMatch).
function cityFromLabel(label: string): string {
  return label.replace(/\d{5}/g, "").trim();
}

// Même idiome de repli accents/casse que normalizeCompanyName (@job-harvester/core/dedup/company-name.ts).
function normalizeCityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const EARTH_RADIUS_KM = 6371;
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// JOB-75 (I-2) : distance orthodromique entre l'offre et une localisation de campagne, pour
// comparer au rayon déclaré (radiusKm) plutôt qu'à l'égalité stricte de département — un rayon
// de 30 km autour de Lille déborde légitimement sur les départements voisins (62, 80).
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Calculé une fois par runCampaign(), à partir de TOUTES les localisations du run — pas de la
// query d'une seule itération de boucle (voir "piège identifié" dans la spec) : un connecteur
// locationScoped:false n'est fetché qu'une fois avec la première localisation, ses offres
// doivent quand même pouvoir matcher n'importe laquelle des localisations du run.
export function acceptableLocationsFromLocations(
  locations: { label: string; lat: number; lng: number; radiusKm: number }[],
): AcceptableLocation[] {
  return locations.map((location) => ({ label: location.label, lat: location.lat, lng: location.lng, radiusKm: location.radiusKm }));
}

// Seule source de vérité pour dériver un QueryFilter à partir d'une campagne — utilisée à la
// fois à l'écriture (runCampaign, sur les offres fraîchement collectées) et à la lecture
// (GET /offers?campaignId=..., sur les offres déjà stockées) pour que "ce qui est collecté" et
// "ce qui est affiché pour cette campagne" restent rigoureusement les mêmes critères.
export function queryFilterFromCampaign(campaign: CampaignConfig): QueryFilter {
  return {
    contractTypes: campaign.contractTypes,
    keywords: campaign.keywords,
    acceptableLocations: acceptableLocationsFromLocations(campaign.locations),
  };
}

export type LocationVerdict = "matched" | "out-of-zone" | "unresolved";

// JOB-75 : cascade à 3 niveaux, du plus fiable au plus grossier.
//  1. Rayon géographique (haversine) si l'offre porte ses propres coordonnées (welcometothejungle,
//     labonnealternance) — cohérent avec le radiusKm déjà utilisé par ces connecteurs pour
//     interroger leur API en amont ; l'égalité stricte de département rejetait à tort des offres
//     pourtant dans le rayon déclaré mais situées dans un département voisin.
//  2. Égalité de département si l'offre n'a pas de coordonnées mais un département résolu
//     (francetravail, smartrecruiters, talentsoft, digitalrecruiters, jsonld-generic) — logique
//     historique inchangée.
//  3. Correspondance par nom de ville normalisé (accents/casse) contre les libellés des
//     localisations de la campagne, en dernier recours — nécessaire pour workday, qui n'expose
//     ni coordonnées ni code postal, seulement un nom de ville libre.
// Fail-closed si aucun des trois ne permet de trancher (aucune information de localisation
// exploitable sur l'offre).
export function resolveLocationVerdict(offer: NormalizedOffer, acceptable: AcceptableLocation[]): LocationVerdict {
  if (acceptable.length === 0) return "matched";

  if (offer.location.lat !== undefined && offer.location.lng !== undefined) {
    const withinRadius = acceptable.some(
      (location) => haversineDistanceKm(offer.location.lat!, offer.location.lng!, location.lat, location.lng) <= location.radiusKm,
    );
    return withinRadius ? "matched" : "out-of-zone";
  }

  if (offer.location.department) {
    const acceptableDepartments = new Set(
      acceptable.map((location) => departmentFromLabel(location.label)).filter((department): department is string => department !== undefined),
    );
    if (acceptableDepartments.size > 0) {
      return acceptableDepartments.has(offer.location.department) ? "matched" : "out-of-zone";
    }
  }

  const offerCity = offer.location.city ? normalizeCityName(offer.location.city) : "";
  if (offerCity) {
    // Un nom de ville non vide EST une information de localisation exploitable, même quand il ne
    // correspond à aucune localisation acceptée : "Saint-Denis" face à un filtre "Lille" est hors
    // zone (out-of-zone), pas "non vérifiable" (unresolved) — bug constaté le 2026-08-26 sur une
    // vraie collecte (workday), où ce cas retombait à tort dans le fail-closed générique et
    // polluait unresolvedLocationCount/le console.warn avec des rejets pourtant parfaitement
    // normaux.
    const acceptableCities = new Set(acceptable.map((location) => normalizeCityName(cityFromLabel(location.label))));
    return acceptableCities.has(offerCity) ? "matched" : "out-of-zone";
  }

  return "unresolved";
}

export function offerMatchesQuery(offer: NormalizedOffer, filter: QueryFilter): boolean {
  if (filter.contractTypes.length > 0 && !filter.contractTypes.includes(offer.contractType)) {
    return false;
  }
  if (!matchesKeywords(`${offer.title} ${offer.descriptionText}`, filter.keywords)) {
    return false;
  }

  const verdict = resolveLocationVerdict(offer, filter.acceptableLocations);
  if (verdict === "unresolved") {
    console.warn(
      `[query-filter] offre "${offer.title}" (${offer.source}) exclue — localisation non vérifiable (ni géolocalisation, ni département, ni ville reconnue).`,
    );
    return false;
  }
  return verdict === "matched";
}
