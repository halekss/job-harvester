import type { Campaign } from "../api/client.js";

interface CampaignParamTogglesProps {
  campaign: Campaign;
  // undefined = aucune restriction (toute la campagne) — voir OfferFilters.campaignLocations/
  // campaignContractTypes (api/client.ts) pour la même convention côté requête.
  selectedLocations?: string[];
  selectedContractTypes?: string[];
  onToggleLocation: (label: string) => void;
  onToggleContractType: (type: string) => void;
}

const CHIP_CLASS =
  "rounded border px-2 py-1 font-mono text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool";

function chipClass(pressed: boolean): string {
  return `${CHIP_CLASS} ${pressed ? "border-accent/40 text-text" : "border-border text-text-faint opacity-50"}`;
}

// Boutons de bascule pour restreindre, sans toucher à campaigns.yaml, la campagne sélectionnée à
// un sous-ensemble de ses propres localisations/types de contrat (ex. retirer Paris, ne garder
// que l'alternance) — voir GET /offers?locations=...&contractTypes=... (packages/api/routes/offers.ts).
export function CampaignParamToggles({
  campaign,
  selectedLocations,
  selectedContractTypes,
  onToggleLocation,
  onToggleContractType,
}: CampaignParamTogglesProps) {
  if (campaign.locations.length === 0 && campaign.contractTypes.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Paramètres de la campagne"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
    >
      {campaign.locations.map((location) => {
        const pressed = selectedLocations ? selectedLocations.includes(location.label) : true;
        return (
          <button
            key={location.label}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggleLocation(location.label)}
            className={chipClass(pressed)}
          >
            {location.label}
          </button>
        );
      })}
      {campaign.contractTypes.map((type) => {
        const pressed = selectedContractTypes ? selectedContractTypes.includes(type) : true;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggleContractType(type)}
            className={chipClass(pressed)}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}
