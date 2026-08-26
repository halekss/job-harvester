import { useState, type KeyboardEvent } from "react";
import type { OfferSummary } from "../api/client.js";
import { PIPELINE_LANES } from "../lib/pipeline.js";
import { useSetOfferStatus } from "../hooks/useSetOfferStatus.js";
import { PipelineCard } from "./PipelineCard.js";

interface QuaiStripProps {
  offers: OfferSummary[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// Le Quai n'est jamais un lieu de repos : toute offre qui y apparaît a status "new"
// (aucun événement encore posé) — voir groupByStatus (lib/pipeline.ts).
//
// Le Quai n'est pas une sixième voie (design §4) : il porte donc sa propre sélection clavier,
// indépendante de celle de PipelineBoard. Pas de j/k/h/l ici — le Quai est une liste plate, pas
// une grille de voies — seulement 1-6 (assigner), Entrée (ouvrir le lien) et Échap (désélectionner).
export function QuaiStrip({ offers, collapsed, onToggleCollapsed }: QuaiStripProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const setStatus = useSetOfferStatus();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (selectedIndex === null) return;
    const offer = offers[selectedIndex];
    if (!offer) return;
    if (event.key === "Escape") {
      setSelectedIndex(null);
    } else if (event.key === "Enter") {
      window.open(offer.applyUrl ?? offer.canonicalUrl, "_blank", "noopener,noreferrer");
    } else {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= PIPELINE_LANES.length) {
        const targetLane = PIPELINE_LANES[n - 1]!;
        // Toute offre du Quai a status "new", donc jamais déjà dans la voie ciblée — pas besoin
        // du garde-fou "no-op" utilisé par PipelineBoard pour ses propres assignations.
        setStatus.mutate({ offerId: offer.id, type: targetLane.type });
      }
    }
  };

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
          <div
            role="group"
            aria-label="Offres non triées"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="flex gap-2 overflow-x-auto px-3 pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-md"
          >
            {offers.map((offer, index) => (
              <div key={offer.id} className="w-40 flex-none">
                <PipelineCard
                  offer={offer}
                  status="new"
                  selected={selectedIndex === index}
                  onSelect={() => setSelectedIndex(index)}
                  onDragStart={() => {}}
                />
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
