import type { OfferFilters } from "../api/client.js";
import { useToggleOfferEvent } from "../hooks/useToggleOfferEvent.js";

const EVENT_TYPES: Array<{ type: string; label: string }> = [
  { type: "applied", label: "Candidature" },
  { type: "spontaneous", label: "Spontanée" },
  { type: "followup", label: "Relance" },
  { type: "interview", label: "Entretien" },
  { type: "rejected", label: "Refus" },
  { type: "no_reply", label: "Sans réponse" },
];

// Teintes distinctes (pas juste vert/rouge) choisies pour rester lisibles pour les daltoniens ;
// le libellé texte reste toujours affiché, la couleur n'est jamais le seul signal.
const STATUS_STYLES: Record<string, { active: string; inactive: string }> = {
  applied: {
    active: "border-status-applied bg-status-applied text-background",
    inactive: "border-border text-text hover:border-status-applied hover:text-status-applied",
  },
  spontaneous: {
    active: "border-status-spontaneous bg-status-spontaneous text-background",
    inactive: "border-border text-text hover:border-status-spontaneous hover:text-status-spontaneous",
  },
  followup: {
    active: "border-status-followup bg-status-followup text-background",
    inactive: "border-border text-text hover:border-status-followup hover:text-status-followup",
  },
  interview: {
    active: "border-status-interview bg-status-interview text-background",
    inactive: "border-border text-text hover:border-status-interview hover:text-status-interview",
  },
  rejected: {
    active: "border-status-rejected bg-status-rejected text-background",
    inactive: "border-border text-text hover:border-status-rejected hover:text-status-rejected",
  },
  no_reply: {
    active: "border-status-noreply bg-status-noreply text-background",
    inactive: "border-border text-text hover:border-status-noreply hover:text-status-noreply",
  },
};

export function EventButtons({
  offerId,
  filters,
  activeEvents,
}: {
  offerId: string;
  filters: OfferFilters;
  activeEvents: Record<string, string>;
}) {
  const mutation = useToggleOfferEvent(filters);

  return (
    <div className="flex gap-1 flex-nowrap" role="group" aria-label="Actions de candidature">
      {EVENT_TYPES.map(({ type, label }) => {
        const activeEventId = activeEvents[type];
        const isActive = Boolean(activeEventId);
        const style = STATUS_STYLES[type]!;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            onClick={() => mutation.mutate({ offerId, type, activeEventId })}
            disabled={mutation.isPending}
            className={`text-[11px] leading-4 px-1.5 py-1 rounded-sm border whitespace-nowrap transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool disabled:opacity-50 ${
              isActive ? style.active : style.inactive
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
