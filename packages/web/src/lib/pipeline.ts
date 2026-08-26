import type { OfferSummary } from "../api/client.js";

export type LaneType = "applied" | "spontaneous" | "followup" | "interview" | "rejected" | "no_reply";

export interface PipelineLane {
  type: LaneType;
  label: string;
}

// Ordre déjà établi côté produit par EventButtons — conservé pour continuité visuelle.
export const PIPELINE_LANES: PipelineLane[] = [
  { type: "applied", label: "Candidature" },
  { type: "spontaneous", label: "Spontané" },
  { type: "followup", label: "Relance" },
  { type: "interview", label: "Entretien" },
  { type: "rejected", label: "Refus" },
  { type: "no_reply", label: "Sans réponse" },
];

export interface GroupedOffers {
  quai: OfferSummary[];
  lanes: Record<LaneType, OfferSummary[]>;
}

function emptyLanes(): Record<LaneType, OfferSummary[]> {
  return {
    applied: [],
    spontaneous: [],
    followup: [],
    interview: [],
    rejected: [],
    no_reply: [],
  };
}

export function groupByStatus(offers: OfferSummary[]): GroupedOffers {
  const lanes = emptyLanes();
  const quai: OfferSummary[] = [];
  for (const offer of offers) {
    if (offer.status === "new") {
      quai.push(offer);
    } else if (offer.status in lanes) {
      lanes[offer.status as LaneType].push(offer);
    }
  }
  return { quai, lanes };
}
