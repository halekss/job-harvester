import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import type { OfferSummary } from "../api/client.js";
import { PIPELINE_LANES, groupByStatus, type LaneType } from "../lib/pipeline.js";
import { useSetOfferStatus } from "../hooks/useSetOfferStatus.js";
import { useUnassignOffer } from "../hooks/useUnassignOffer.js";
import { PipelineCard } from "./PipelineCard.js";

interface Selection {
  laneIndex: number;
  offerIndex: number;
}

interface PipelineBoardProps {
  offers: OfferSummary[];
  hideRejected: boolean;
}

// Les touches 1-6 assignent toujours la voie canonique de PIPELINE_LANES (indépendamment de
// hideRejected) : masquer visuellement le Refus n'empêche pas d'y classer une carte au clavier.
export function PipelineBoard({ offers, hideRejected }: PipelineBoardProps) {
  const grouped = useMemo(() => groupByStatus(offers), [offers]);
  const lanes = useMemo(
    () => PIPELINE_LANES.filter((lane) => !hideRejected || lane.type !== "rejected"),
    [hideRejected],
  );
  const setStatus = useSetOfferStatus();
  const unassign = useUnassignOffer();
  const [selection, setSelection] = useState<Selection | null>(null);

  const offersInLane = (laneIndex: number): OfferSummary[] => {
    const lane = lanes[laneIndex];
    return lane ? grouped.lanes[lane.type] : [];
  };

  const select = (laneIndex: number, offerIndex: number) => {
    const list = offersInLane(laneIndex);
    if (list.length === 0) {
      setSelection(null);
      return;
    }
    setSelection({ laneIndex, offerIndex: Math.max(0, Math.min(list.length - 1, offerIndex)) });
  };

  // Première voie non vide, offre en tête — utilisée quand on navigue au clavier sans sélection
  // préalable (Fix 3) ou en dernier recours si aucune voie non vide n'existe dans une direction.
  const findFirstNonEmptyLane = (): Selection | null => {
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
      if (offersInLane(laneIndex).length > 0) return { laneIndex, offerIndex: 0 };
    }
    return null;
  };

  // h/l : saute par-dessus les voies vides plutôt que de tomber dessus (Fix 4) — une sélection
  // ne doit jamais être perdue simplement parce que la voie voisine est vide. Si aucune voie non
  // vide n'existe dans cette direction, on ne bouge pas (no-op, la sélection actuelle est gardée).
  const selectLane = (fromLaneIndex: number, direction: 1 | -1) => {
    let laneIndex = fromLaneIndex + direction;
    while (laneIndex >= 0 && laneIndex < lanes.length) {
      if (offersInLane(laneIndex).length > 0) {
        setSelection({ laneIndex, offerIndex: 0 });
        return;
      }
      laneIndex += direction;
    }
  };

  const handleBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selection) {
      // Clavier = mode principal : une première pression sur j/k/h/l doit amorcer une sélection
      // plutôt que de rester muette tant qu'aucun clic n'a eu lieu (Fix 3).
      if (event.key === "j" || event.key === "k" || event.key === "h" || event.key === "l") {
        const first = findFirstNonEmptyLane();
        if (first) {
          event.preventDefault();
          setSelection(first);
        }
      }
      return;
    }
    if (event.key === "j") {
      event.preventDefault();
      select(selection.laneIndex, selection.offerIndex + 1);
    } else if (event.key === "k") {
      event.preventDefault();
      select(selection.laneIndex, selection.offerIndex - 1);
    } else if (event.key === "l") {
      event.preventDefault();
      selectLane(selection.laneIndex, 1);
    } else if (event.key === "h") {
      event.preventDefault();
      selectLane(selection.laneIndex, -1);
    } else if (event.key === "Escape") {
      setSelection(null);
    } else if (event.key === "Enter") {
      const offer = offersInLane(selection.laneIndex)[selection.offerIndex];
      if (offer) window.open(offer.applyUrl ?? offer.canonicalUrl, "_blank", "noopener,noreferrer");
    } else if (event.key === "0") {
      // Repositionne la carte sélectionnée sur le Quai — symétrique de 1-6, hors erreur de
      // classement (voir useUnassignOffer pour pourquoi c'est une suppression et pas un POST).
      event.preventDefault();
      const offer = offersInLane(selection.laneIndex)[selection.offerIndex];
      const eventId = offer?.activeEvents[offer.status];
      if (offer && eventId) unassign.mutate({ offerId: offer.id, eventId });
    } else {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= PIPELINE_LANES.length) {
        const offer = offersInLane(selection.laneIndex)[selection.offerIndex];
        const targetLane = PIPELINE_LANES[n - 1]!;
        // Pas d'événement redondant si la carte est déjà dans la voie ciblée (Fix 5).
        if (offer && offer.status !== targetLane.type) setStatus.mutate({ offerId: offer.id, type: targetLane.type });
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetType: LaneType) => {
    event.preventDefault();
    const offerId = event.dataTransfer.getData("text/plain");
    if (!offerId) return;
    const offer = offers.find((candidate) => candidate.id === offerId);
    // Pas d'événement redondant si la carte est déjà dans la voie ciblée (Fix 5) — couvre aussi
    // un dépôt sur sa propre voie d'origine.
    if (offer && offer.status === targetType) return;
    setStatus.mutate({ offerId, type: targetType });
  };

  return (
    <div
      role="group"
      aria-label="Pipeline de candidatures"
      tabIndex={0}
      onKeyDown={handleBoardKeyDown}
      className="grid gap-3 overflow-x-auto pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool rounded-md"
      style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(11rem, 1fr))` }}
    >
      {lanes.map((lane, laneIndex) => {
        const list = offersInLane(laneIndex);
        return (
          <div
            key={lane.type}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, lane.type)}
            className="flex min-h-[6rem] flex-col gap-2 rounded-md border border-border bg-surface-raised p-2"
          >
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-text-faint">
              <span>{lane.label}</span>
              <span className="tabular-nums">{list.length}</span>
            </div>
            {list.length === 0 && <p className="text-[11px] text-text-faint">—</p>}
            {list.map((offer, offerIndex) => (
              <PipelineCard
                key={offer.id}
                offer={offer}
                status={lane.type}
                selected={selection?.laneIndex === laneIndex && selection.offerIndex === offerIndex}
                onSelect={() => select(laneIndex, offerIndex)}
                onDragStart={() => {}}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
