import type { OfferSummary } from "../api/client.js";
import { StatusBadge } from "./StatusBadge.js";

interface QuaiStripProps {
  offers: OfferSummary[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// Le Quai n'est jamais un lieu de repos : toute offre qui y apparaît a status "new"
// (aucun événement encore posé) — voir groupByStatus (lib/pipeline.ts).
export function QuaiStrip({ offers, collapsed, onToggleCollapsed }: QuaiStripProps) {
  return (
    <section className="mb-4 rounded-md border border-border bg-surface" aria-label="Quai de réception">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="font-mono text-xs uppercase tracking-wide text-text-faint transition-colors duration-150 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-sm"
        >
          Quai · {offers.length} nouvelle{offers.length > 1 ? "s" : ""}
        </button>
      </div>
      {!collapsed &&
        (offers.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-text-muted">Aucune offre en attente de tri.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-3 pb-3">
            {offers.map((offer) => (
              <div key={offer.id} className="w-40 flex-none rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs">
                <p className="truncate font-medium text-text">{offer.title}</p>
                <p className="truncate font-mono text-[11px] text-text-muted">
                  {offer.location.city} · {offer.source}
                </p>
                <div className="mt-1">
                  <StatusBadge status="new" />
                </div>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
