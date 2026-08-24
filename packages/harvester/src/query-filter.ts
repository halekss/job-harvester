import { departmentFromPostalCode, type ContractType, type NormalizedOffer } from "@job-harvester/core";

export interface QueryFilter {
  contractTypes: ContractType[];
  keywords: string[];
  acceptableDepartments: string[];
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

// Calculé une fois par runCampaign(), à partir de TOUTES les localisations du run — pas de la
// query d'une seule itération de boucle (voir "piège identifié" dans la spec) : un connecteur
// locationScoped:false n'est fetché qu'une fois avec la première localisation, ses offres
// doivent quand même pouvoir matcher n'importe laquelle des localisations du run.
export function acceptableDepartmentsFromLocations(locations: { label: string }[]): string[] {
  const departments = new Set<string>();
  for (const location of locations) {
    const department = departmentFromLabel(location.label);
    if (department) departments.add(department);
  }
  return Array.from(departments);
}

export function offerMatchesQuery(offer: NormalizedOffer, filter: QueryFilter): boolean {
  if (filter.contractTypes.length > 0 && !filter.contractTypes.includes(offer.contractType)) {
    return false;
  }
  if (!matchesKeywords(`${offer.title} ${offer.descriptionText}`, filter.keywords)) {
    return false;
  }
  if (filter.acceptableDepartments.length > 0) {
    if (!offer.location.department) {
      console.warn(
        `[query-filter] offre "${offer.title}" (${offer.source}) exclue — aucun département résolu pour vérifier le filtre de localisation.`,
      );
      return false;
    }
    if (!filter.acceptableDepartments.includes(offer.location.department)) {
      return false;
    }
  }
  return true;
}
