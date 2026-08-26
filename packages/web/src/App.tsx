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
    <main className="min-h-screen bg-background text-text p-6 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-text tracking-tight">job-harvester</h1>
      </header>

      <HarvestControl
        campaignId={campaignId ?? ""}
        onCampaignChange={(id) => setFilters((current) => ({ ...current, campaignId: id }))}
      />
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="mb-3">
        <button
          type="button"
          role="switch"
          aria-checked={followUpOnly}
          onClick={() => setFollowUpOnly((v) => !v)}
          className="flex items-center gap-2 text-sm text-text rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cool"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
              followUpOnly ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-text transition-transform duration-150 ${
                followUpOnly ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </span>
          À relancer uniquement
        </button>
      </div>
      <BulkActionBar
        selectedCount={selectedIds.size}
        onMarkFollowedUp={handleMarkFollowedUp}
        onClearSelection={() => setSelectedIds(new Set())}
        disabled={bulkMutation.isPending}
      />
      {offersQuery.isLoading && (
        <div className="rounded-md border border-border px-6 py-10 text-center">
          <p className="text-sm text-text-muted">Chargement des offres…</p>
        </div>
      )}
      {offersQuery.error && (
        <div className="rounded-md border border-danger/40 bg-surface px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-danger">Erreur de chargement des offres.</p>
          <button
            type="button"
            onClick={() => offersQuery.refetch()}
            className="text-xs px-2.5 py-1.5 rounded-sm border border-danger/40 text-text transition-colors duration-150 hover:border-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
          >
            Réessayer
          </button>
        </div>
      )}
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
          className="mt-3 text-sm px-3 py-1.5 rounded-sm border border-border text-text transition-colors duration-150 hover:border-accent-cool disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
        >
          {offersQuery.isFetchingNextPage ? "Chargement…" : "Charger plus d'offres"}
        </button>
      )}
    </main>
  );
}
