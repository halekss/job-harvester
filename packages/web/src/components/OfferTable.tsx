import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { OfferFilters, OfferSummary } from "../api/client.js";
import { EventButtons } from "./EventButtons.js";

const ROW_GRID =
  "grid-cols-[2.5rem_minmax(10rem,2fr)_minmax(8rem,1.2fr)_minmax(6rem,0.8fr)_minmax(8rem,1.2fr)_6.5rem_6.5rem_auto]";

interface OfferTableProps {
  offers: OfferSummary[];
  filters: OfferFilters;
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

export function OfferTable({ offers, filters, selectedIds, onToggleOne, onToggleAll, allSelected }: OfferTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const virtualizer = useVirtualizer({
    count: offers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  const moveFocus = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(offers.length - 1, nextIndex));
      setFocusedIndex(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto" });
      requestAnimationFrame(() => {
        parentRef.current?.querySelector<HTMLDivElement>(`[data-row-index="${clamped}"]`)?.focus();
      });
    },
    [offers.length, virtualizer],
  );

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(offers.length - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onToggleOne(offers[index]!.id);
        break;
      default:
        break;
    }
  };

  if (offers.length === 0) {
    return <p className="text-[var(--color-text-muted)] text-sm">Aucune offre.</p>;
  }

  return (
    <div
      role="table"
      aria-label="Offres d'emploi"
      aria-rowcount={offers.length + 1}
      className="w-full text-sm border border-[var(--color-border)] rounded overflow-hidden"
    >
      <div role="rowgroup">
        <div
          role="row"
          aria-rowindex={1}
          className={`grid ${ROW_GRID} gap-2 items-center px-2 py-2 text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-surface)]`}
        >
          <div role="columnheader">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label="Sélectionner toutes les offres"
            />
          </div>
          <div role="columnheader">Titre</div>
          <div role="columnheader">Entreprise</div>
          <div role="columnheader">Ville</div>
          <div role="columnheader">Source</div>
          <div role="columnheader" className="tabular-nums">
            Publiée
          </div>
          <div role="columnheader" className="tabular-nums">
            À relancer
          </div>
          <div role="columnheader">Actions</div>
        </div>
      </div>
      <div ref={parentRef} role="rowgroup" className="max-h-[70vh] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const offer = offers[virtualRow.index]!;
            const selected = selectedIds.has(offer.id);
            return (
              <div
                key={offer.id}
                data-row-index={virtualRow.index}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                aria-selected={selected}
                tabIndex={focusedIndex === virtualRow.index ? 0 : -1}
                onFocus={() => setFocusedIndex(virtualRow.index)}
                onKeyDown={(event) => handleRowKeyDown(event, virtualRow.index)}
                className={`grid ${ROW_GRID} gap-2 items-center px-2 border-b border-[var(--color-border)] focus:outline focus:outline-2 focus:outline-[var(--color-accent)] focus:-outline-offset-2 ${
                  selected ? "bg-[var(--color-surface)]" : ""
                }`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div role="cell">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleOne(offer.id)}
                    aria-label={`Sélectionner ${offer.title}`}
                  />
                </div>
                <div role="cell" className="truncate">
                  <a href={offer.applyUrl ?? offer.canonicalUrl} target="_blank" rel="noopener noreferrer">
                    {offer.title}
                  </a>
                </div>
                <div role="cell" className="truncate">
                  {offer.company.name}
                </div>
                <div role="cell" className="truncate">
                  {offer.location.city}
                </div>
                <div role="cell" className="truncate">
                  {offer.originSource ? `${offer.originSource} (via ${offer.source})` : offer.source}
                </div>
                <div role="cell" className="tabular-nums">
                  {formatDate(offer.postedAt)}
                </div>
                <div role="cell" className="tabular-nums">
                  {formatDate(offer.nextFollowUpAt)}
                </div>
                <div role="cell">
                  <EventButtons offerId={offer.id} filters={filters} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
