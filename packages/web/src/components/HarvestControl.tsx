import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCampaigns, runHarvest, type HarvestFilters, type HarvestRunResult, type RunSummary } from "../api/client.js";

type LastResult = ({ campaignId: string } & HarvestRunResult) | { campaignId: string; error: string };

// JOB-audit-2026-08-21 : filtres ad-hoc du bouton "Lancer la collecte" - remplacent les champs
// correspondants de la campagne pour CETTE collecte uniquement, sans jamais toucher
// campaigns.yaml. "Alternance" = les deux contrats concernés ; CDI/CDD sont indissociables
// pour le système aujourd'hui (aucun connecteur ne distingue les deux), donc les deux
// retombent sur "autre" - décision assumée, gardés comme deux options distinctes dans l'UI.
const CONTRACT_OPTIONS: Record<string, string[]> = {
  Alternance: ["apprentissage", "professionnalisation"],
  CDI: ["autre"],
  CDD: ["autre"],
};

// Mêmes coordonnées/rayon que config/campaigns.yaml - une seule localisation au lieu de
// boucler sur toutes celles de la campagne.
const CITY_LOCATIONS: Record<string, { label: string; lat: number; lng: number; radiusKm: number }> = {
  Lille: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  Amiens: { label: "Amiens 80000", lat: 49.903041, lng: 2.292605, radiusKm: 30 },
};

export function HarvestControl() {
  const queryClient = useQueryClient();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metier, setMetier] = useState("");
  const [contract, setContract] = useState("");
  const [city, setCity] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const mutation = useMutation({
    mutationFn: ({ campaignId, filters }: { campaignId: string; filters: HarvestFilters }) => runHarvest(campaignId, filters),
    onSuccess: (result, { campaignId }) => {
      setLastResult({ campaignId, ...result });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (error, { campaignId }) => {
      setLastResult({ campaignId, error: error instanceof Error ? error.message : String(error) });
    },
  });

  const campaignId = selectedCampaignId || campaigns?.[0]?.id || "";

  const handleLaunch = () => {
    if (!campaignId) return;
    const filters: HarvestFilters = {};
    if (metier.trim()) filters.keywords = [metier.trim()];
    if (contract && CONTRACT_OPTIONS[contract]) filters.contractTypes = CONTRACT_OPTIONS[contract];
    if (city && CITY_LOCATIONS[city]) filters.location = CITY_LOCATIONS[city];
    mutation.mutate({ campaignId, filters });
  };

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-1 text-sm">
          Métier
          <input
            type="text"
            value={metier}
            onChange={(event) => setMetier(event.target.value)}
            placeholder="ex. marketing"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-32"
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          Contrat
          <select
            value={contract}
            onChange={(event) => setContract(event.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
          >
            <option value="">Tous</option>
            <option value="Alternance">Alternance</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          Ville
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
          >
            <option value="">Toutes</option>
            <option value="Lille">Lille</option>
            <option value="Amiens">Amiens</option>
          </select>
        </label>
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
                ? `✓ ${summary.rawCount} offre(s) récupérée(s), ${summary.normalizedCount} normalisée(s), ${summary.rejectedCount} rejetée(s)`
                : `✗ échec — ${summary.errorMessage}`}
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
