import type { LaneType } from "../lib/pipeline.js";

export type StatusKey = LaneType | "new";

const STATUS_LABEL: Record<StatusKey, string> = {
  new: "Collecté",
  applied: "Candidature",
  spontaneous: "Spontané",
  followup: "Relance",
  interview: "Entretien",
  rejected: "Refus",
  no_reply: "Sans réponse",
};

const SUBTLE_CLASS: Record<StatusKey, string> = {
  new: "bg-status-new-bg text-status-new-fg",
  applied: "bg-status-applied-bg text-status-applied-fg",
  spontaneous: "bg-status-spontaneous-bg text-status-spontaneous-fg",
  followup: "bg-status-followup-bg text-status-followup-fg",
  interview: "bg-status-interview-bg text-status-interview-fg",
  rejected: "bg-status-rejected-bg text-status-rejected-fg",
  no_reply: "bg-status-noreply-bg text-status-noreply-fg",
};

const SOLID_CLASS: Record<StatusKey, string> = {
  new: "bg-status-new-solid text-status-new-on",
  applied: "bg-status-applied-solid text-status-applied-on",
  spontaneous: "bg-status-spontaneous-solid text-status-spontaneous-on",
  followup: "bg-status-followup-solid text-status-followup-on",
  interview: "bg-status-interview-solid text-status-interview-on",
  rejected: "bg-status-rejected-solid text-status-rejected-on",
  no_reply: "bg-status-noreply-solid text-status-noreply-on",
};

export function StatusBadge({ status, solid = false }: { status: StatusKey; solid?: boolean }) {
  const className = solid ? SOLID_CLASS[status] : SUBTLE_CLASS[status];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
