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
    <div className="flex gap-1 flex-wrap" role="group" aria-label="Actions de candidature">
      {EVENT_TYPES.map(({ type, label }) => {
        const activeEventId = activeEvents[type];
        const isActive = Boolean(activeEventId);
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            onClick={() => mutation.mutate({ offerId, type, activeEventId })}
            disabled={mutation.isPending}
            className={`text-xs px-2 py-1 rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50 ${
              isActive
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
