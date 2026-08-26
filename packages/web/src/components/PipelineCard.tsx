import type { DragEvent } from "react";
import type { OfferSummary } from "../api/client.js";
import { StatusBadge, type StatusKey } from "./StatusBadge.js";

interface PipelineCardProps {
  offer: OfferSummary;
  status: StatusKey;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (offerId: string) => void;
}

export function PipelineCard({ offer, status, selected, onSelect, onDragStart }: PipelineCardProps) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", offer.id);
    onDragStart(offer.id);
  };

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={offer.title}
      onClick={onSelect}
      className={`rounded-md border bg-surface px-2.5 py-2 text-xs transition-colors duration-150 ${
        selected ? "border-accent outline outline-2 outline-accent" : "border-border hover:border-accent/40"
      }`}
    >
      <div
        draggable
        onDragStart={handleDragStart}
        aria-label="Glisser pour déplacer"
        className="mb-1 h-3 w-4 cursor-grab text-text-faint"
      >
        ⠿
      </div>
      <a
        href={offer.applyUrl ?? offer.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="block truncate font-medium text-text underline decoration-border decoration-1 underline-offset-2 hover:text-accent hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-sm"
      >
        {offer.title}
      </a>
      <div className="mt-0.5 truncate font-mono text-[11px] text-text-muted">
        {offer.location.city} · {offer.source}
      </div>
      <div className="mt-1">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
