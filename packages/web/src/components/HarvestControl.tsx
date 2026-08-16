import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCampaigns, runHarvest, type RunSummary } from "../api/client.js";

type LastResult = { campaignId: string; summaries: RunSummary[] } | { campaignId: string; error: string };

export function HarvestControl() {
  const queryClient = useQueryClient();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const mutation = useMutation({
    mutationFn: runHarvest,
    onSuccess: (summaries, campaignId) => {
      setLastResult({ campaignId, summaries });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error, campaignId) => {
      setLastResult({ campaignId, error: error instanceof Error ? error.message : String(error) });
    },
  });

  const campaignId = selectedCampaignId || campaigns?.[0]?.id || "";

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {campaigns && campaigns.length > 1 && (
          <select
            value={campaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.id}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => campaignId && mutation.mutate(campaignId)}
          disabled={!campaignId || mutation.isPending}
          className="bg-[var(--color-accent)] text-white rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {mutation.isPending ? "Collecte en cours…" : "Lancer la collecte"}
        </button>
      </div>
      {lastResult && "summaries" in lastResult && (
        <ul className="text-xs text-[var(--color-text-muted)]">
          {lastResult.summaries.map((summary) => (
            <li key={summary.runId}>
              {summary.ok
                ? `✓ ${summary.rawCount} offre(s) récupérée(s), ${summary.normalizedCount} normalisée(s), ${summary.rejectedCount} rejetée(s)`
                : `✗ échec — ${summary.errorMessage}`}
            </li>
          ))}
        </ul>
      )}
      {lastResult && "error" in lastResult && <p className="text-xs text-red-400">Erreur : {lastResult.error}</p>}
    </div>
  );
}
