import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OfferTable } from "./components/OfferTable.js";
import { HarvestControl } from "./components/HarvestControl.js";
import { FilterBar } from "./components/FilterBar.js";
import { BulkActionBar } from "./components/BulkActionBar.js";
import { useUrlFilters } from "./hooks/useUrlFilters.js";
import { useOffersQuery } from "./hooks/useOffersQuery.js";
import { useOfferEventMutation } from "./hooks/useOfferEventMutation.js";
import { getCampaigns } from "./api/client.js";

export default function App() {
  const { filters, setFilters } = useUrlFilters();
  // Même campagne partagée entre le déclencheur de collecte et le scope du tableau (audit
  // 2026-08-26) : le jobboard affiche les offres de LA campagne sélectionnée, pas tout
  // l'historique jamais collecté. `useQuery` est dédupliqué avec l'appel identique fait par
  // HarvestControl (même queryKey), pas de requête réseau supplémentaire.
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const campaignId = filters.campaignId || campaigns?.[0]?.id;
  const offersQuery = useOffersQuery({ ...filters, campaignId });
  const offers = useMemo(() => offersQuery.data?.pages.flatMap((page) => page.offers) ?? [], [offersQuery.data]);

  const [followUpOnly, setFollowUpOnly] = useState(false);
  const displayedOffers = useMemo(() => {
    if (!followUpOnly) return offers;
    const now = new Date().toISOString();
    return offers.filter((offer) => offer.nextFollowUpAt && offer.nextFollowUpAt <= now);
  }, [offers, followUpOnly]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = displayedOffers.length > 0 && displayedOffers.every((offer) => selectedIds.has(offer.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(displayedOffers.map((offer) => offer.id)));
  };

  const bulkMutation = useOfferEventMutation(filters);
  const handleMarkFollowedUp = () => {
    bulkMutation.mutate(
      { offerIds: Array.from(selectedIds), type: "followup" },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] p-6">
      <h1 className="text-xl font-semibold mb-4">job-harvester</h1>
      <HarvestControl
        campaignId={campaignId ?? ""}
        onCampaignChange={(id) => setFilters((current) => ({ ...current, campaignId: id }))}
      />
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm w-fit">
          <input
            type="checkbox"
            checked={followUpOnly}
            onChange={(event) => setFollowUpOnly(event.target.checked)}
          />
          À relancer uniquement
        </label>
      </div>
      <BulkActionBar
        selectedCount={selectedIds.size}
        onMarkFollowedUp={handleMarkFollowedUp}
        onClearSelection={() => setSelectedIds(new Set())}
        disabled={bulkMutation.isPending}
      />
      {offersQuery.isLoading && <p className="text-[var(--color-text-muted)]">Chargement…</p>}
      {offersQuery.error && <p className="text-red-400">Erreur de chargement des offres.</p>}
      {!offersQuery.isLoading && !offersQuery.error && (
        <OfferTable
          offers={displayedOffers}
          filters={filters}
          selectedIds={selectedIds}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          allSelected={allSelected}
        />
      )}
      {offersQuery.hasNextPage && (
        <button
          type="button"
          onClick={() => offersQuery.fetchNextPage()}
          disabled={offersQuery.isFetchingNextPage}
          className="mt-3 text-sm px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-50"
        >
          {offersQuery.isFetchingNextPage ? "Chargement…" : "Charger plus d'offres"}
        </button>
      )}
    </main>
  );
}
