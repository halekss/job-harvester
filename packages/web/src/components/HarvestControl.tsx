import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCampaigns, runHarvest, type HarvestRunResult } from "../api/client.js";

type LastResult = ({ campaignId: string } & HarvestRunResult) | { campaignId: string; error: string };

interface HarvestControlProps {
  campaignId: string;
  onCampaignChange: (campaignId: string) => void;
}

function summaryTone(result: LastResult): "ok" | "warning" | "error" {
  if ("error" in result) return "error";
  if (result.summaries.some((s) => !s.ok)) return "error";
  if (result.summaries.some((s) => s.unresolvedLocationCount > 0)) return "warning";
  return "ok";
}

const TONE_DOT: Record<"ok" | "warning" | "error", string> = {
  ok: "bg-status-interview",
  warning: "bg-accent",
  error: "bg-danger",
};

// Un seul jeu de critères par campagne (audit 2026-08-26) : plus de filtres ad-hoc
// métier/contrat/ville ici — pour changer les critères d'une campagne, on édite
// config/campaigns.yaml. `campaignId` est contrôlé par le parent : c'est aussi ce qui scope le
// tableau d'offres affiché plus bas (voir App.tsx).
export function HarvestControl({ campaignId, onCampaignChange }: HarvestControlProps) {
  const queryClient = useQueryClient();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [runSeq, setRunSeq] = useState(0);

  const mutation = useMutation({
    mutationFn: (id: string) => runHarvest(id),
    onSuccess: (result, id) => {
      setLastResult({ campaignId: id, ...result });
      setCollapsed(false);
      setRunSeq((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error, id) => {
      setLastResult({ campaignId: id, error: error instanceof Error ? error.message : String(error) });
      setCollapsed(false);
      setRunSeq((n) => n + 1);
    },
  });

  const handleLaunch = () => {
    if (!campaignId) return;
    setCollapsed(false);
    mutation.mutate(campaignId);
  };

  const tone = lastResult ? summaryTone(lastResult) : null;

  return (
    <section className="mb-4 rounded-md border border-border bg-surface-raised shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="harvest-log-panel"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm text-text-muted transition-colors duration-150 hover:text-text rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
          >
            ▾
          </span>
          <span className="font-display text-[15px]">Campagne</span>
        </button>

        {campaigns && campaigns.length > 1 ? (
          <select
            value={campaignId}
            onChange={(event) => onCampaignChange(event.target.value)}
            className="bg-surface border border-border rounded-sm px-2 py-1 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.id}
              </option>
            ))}
          </select>
        ) : (
          campaigns && campaigns.length === 1 && (
            <span className="font-mono text-sm text-text">{campaigns[0]!.id}</span>
          )
        )}

        {collapsed && lastResult && tone && (
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
            {tone === "ok" && "dernière collecte OK"}
            {tone === "warning" && "dernière collecte — avertissements"}
            {tone === "error" && "dernière collecte — erreur"}
          </span>
        )}

        <button
          type="button"
          onClick={handleLaunch}
          disabled={!campaignId || mutation.isPending}
          className="ml-auto flex items-center gap-2 bg-accent text-background rounded-sm px-3 py-1.5 text-sm font-medium transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cool"
        >
          {mutation.isPending && (
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full border-2 border-background/40 border-t-background animate-spin"
            />
          )}
          {mutation.isPending ? "Collecte en cours…" : "Lancer la collecte"}
        </button>
      </div>

      {!collapsed && (
        <div id="harvest-log-panel" className="border-t border-border px-4 py-3">
          {!lastResult && <p className="text-xs text-text-muted">Aucune collecte lancée pour l'instant.</p>}
          {lastResult && "summaries" in lastResult && (
            <ul key={runSeq} className="space-y-1.5 font-mono text-xs">
              {lastResult.summaries.map((summary, index) => (
                <li
                  key={summary.runId}
                  className={`border-l-2 pl-3 py-0.5 [animation:harvest-reveal_220ms_ease-out_both] ${
                    summary.ok ? "border-status-interview" : "border-danger"
                  }`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <p className={summary.ok ? "text-text" : "text-danger"}>
                    {summary.ok
                      ? `✓ [${summary.connectorId}] ${summary.rawCount} offre(s) récupérée(s), ${summary.normalizedCount} normalisée(s), ${summary.rejectedCount} rejetée(s)`
                      : `✗ [${summary.connectorId}] échec — ${summary.errorMessage}`}
                  </p>
                  {summary.unresolvedLocationCount > 0 && (
                    <p className="text-accent">
                      ⚠ {summary.unresolvedLocationCount} offre(s) exclue(s) — localisation non vérifiable pour ce connecteur
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {lastResult && "error" in lastResult && (
            <p className="font-mono text-xs text-danger border-l-2 border-danger pl-3 py-0.5">
              Erreur : {lastResult.error}
            </p>
          )}
          {lastResult && "discoveries" in lastResult && lastResult.discoveries.found.length > 0 && (
            <div className="mt-2 font-mono text-xs text-text-muted border-l-2 border-accent-cool pl-3 py-0.5">
              <p>
                {lastResult.discoveries.found.length} nouvelle{lastResult.discoveries.found.length > 1 ? "s" : ""}{" "}
                cible{lastResult.discoveries.found.length > 1 ? "s" : ""} découverte
                {lastResult.discoveries.found.length > 1 ? "s" : ""} (sur {lastResult.discoveries.probed} entreprise
                {lastResult.discoveries.probed > 1 ? "s" : ""} sondée{lastResult.discoveries.probed > 1 ? "s" : ""}) :
              </p>
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
      )}
    </section>
  );
}
