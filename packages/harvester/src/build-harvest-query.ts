import type { ContractType, HarvestQuery } from "@job-harvester/core";
import type { CampaignConfig, LocationConfig } from "./config/campaign-schema.js";

// Filtres ad-hoc du bouton "Lancer la collecte" (métier/contrat/ville) - remplacent les champs
// correspondants de la campagne pour une seule collecte, sans jamais réécrire campaigns.yaml.
// `location` n'est volontairement pas ici : elle est déjà un paramètre direct de
// buildHarvestQuery, la sélection "une seule ville vs. toutes les localisations de la campagne"
// se fait un niveau au-dessus, dans runCampaign/runCampaignAcrossConnectors.
export interface HarvestOverrides {
  keywords?: string[];
  contractTypes?: ContractType[];
  location?: LocationConfig;
}

// Seule source de vérité pour construire un HarvestQuery à partir d'une campagne et d'une
// localisation — évite la dérive entre orchestrator.ts et la route HTTP /harvest (JOB-24 :
// cette duplication a déjà causé un vrai bug, le champ `targets` oublié dans l'une des deux
// constructions).
export function buildHarvestQuery(campaign: CampaignConfig, location: LocationConfig, overrides: HarvestOverrides = {}): HarvestQuery {
  return {
    campaignId: campaign.id,
    keywords: overrides.keywords ?? campaign.keywords,
    romeCodes: campaign.romeCodes,
    location,
    contractTypes: overrides.contractTypes ?? campaign.contractTypes,
    targets: campaign.targets,
  };
}
