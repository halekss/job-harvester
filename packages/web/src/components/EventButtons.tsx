import type { OfferFilters } from "../api/client.js";
import { useOfferEventMutation } from "../hooks/useOfferEventMutation.js";

const EVENT_TYPES: Array<{ type: string; label: string }> = [
  { type: "applied", label: "Candidature" },
  { type: "spontaneous", label: "Spontanée" },
  { type: "followup", label: "Relance" },
  { type: "interview", label: "Entretien" },
  { type: "rejected", label: "Refus" },
  { type: "no_reply", label: "Sans réponse" },
];

export function EventButtons({ offerId, filters }: { offerId: string; filters: OfferFilters }) {
  const mutation = useOfferEventMutation(filters);

  return (
    <div className="flex gap-1 flex-wrap" role="group" aria-label="Actions de candidature">
      {EVENT_TYPES.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={() => mutation.mutate({ offerIds: [offerId], type })}
          disabled={mutation.isPending}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
