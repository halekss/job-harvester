import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCampaigns, runHarvest, type HarvestRunResult } from "../api/client.js";

type LastResult = ({ campaignId: string } & HarvestRunResult) | { campaignId: string; error: string };

interface HarvestControlProps {
  campaignId: string;
  onCampaignChange: (campaignId: string) => void;
}

// Un seul jeu de critères par campagne (audit 2026-08-26) : plus de filtres ad-hoc
// métier/contrat/ville ici — pour changer les critères d'une campagne, on édite
// config/campaigns.yaml. `campaignId` est contrôlé par le parent : c'est aussi ce qui scope le
// tableau d'offres affiché plus bas (voir App.tsx).
export function HarvestControl({ campaignId, onCampaignChange }: HarvestControlProps) {
  const queryClient = useQueryClient();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => runHarvest(id),
    onSuccess: (result, id) => {
      setLastResult({ campaignId: id, ...result });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error, id) => {
      setLastResult({ campaignId: id, error: error instanceof Error ? error.message : String(error) });
    },
  });

  const handleLaunch = () => {
    if (!campaignId) return;
    mutation.mutate(campaignId);
  };

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {campaigns && campaigns.length > 1 && (
          <select
            value={campaignId}
            onChange={(event) => onCampaignChange(event.target.value)}
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
          onClick={handleLaunch}
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
                ? `✓ [${summary.connectorId}] ${summary.rawCount} offre(s) récupérée(s), ${summary.normalizedCount} normalisée(s), ${summary.rejectedCount} rejetée(s)`
                : `✗ [${summary.connectorId}] échec — ${summary.errorMessage}`}
              {summary.unresolvedLocationCount > 0 && (
                <p className="text-amber-500">
                  ⚠ {summary.unresolvedLocationCount} offre(s) exclue(s) — localisation non vérifiable pour ce connecteur
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {lastResult && "error" in lastResult && <p className="text-xs text-red-400">Erreur : {lastResult.error}</p>}
      {lastResult && "discoveries" in lastResult && lastResult.discoveries.found.length > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          <p>{lastResult.discoveries.found.length} nouvelle{lastResult.discoveries.found.length > 1 ? "s" : ""} cible{lastResult.discoveries.found.length > 1 ? "s" : ""} découverte{lastResult.discoveries.found.length > 1 ? "s" : ""} (sur {lastResult.discoveries.probed} entreprise{lastResult.discoveries.probed > 1 ? "s" : ""} sondée{lastResult.discoveries.probed > 1 ? "s" : ""}) :</p>
          <ul>
            {lastResult.discoveries.found.map((d) => (
              <li key={`${d.companySlug}-${d.platform}`}>
                {d.companySlug} — {d.platform} — {typeof d.target === "string" ? d.target : `${d.target.tenant}.${d.target.dc}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
