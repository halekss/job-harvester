import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HarvestControl } from "./components/HarvestControl.js";
import { FilterBar } from "./components/FilterBar.js";
import { QuaiStrip } from "./components/QuaiStrip.js";
import { PipelineBoard } from "./components/PipelineBoard.js";
import { PipelineFilters } from "./components/PipelineFilters.js";
import { CampaignParamToggles } from "./components/CampaignParamToggles.js";
import { useUrlFilters } from "./hooks/useUrlFilters.js";
import { useOffersQuery } from "./hooks/useOffersQuery.js";
import { getCampaigns } from "./api/client.js";

// Ajoute/retire `value` du sous-ensemble actif (`current`, undefined = tout `all` activé) et
// renvoie undefined dès que le résultat couvre à nouveau tout `all` — pour que l'URL/la requête
// API restent sans paramètre (donc sans restriction) tant que rien n'a réellement été décoché.
function toggleInSelection(all: string[], current: string[] | undefined, value: string): string[] | undefined {
  const enabled = current ?? all;
  const next = enabled.includes(value) ? enabled.filter((v) => v !== value) : [...enabled, value];
  const isFullSet = next.length === all.length && all.every((v) => next.includes(v));
  return isFullSet ? undefined : next;
}

export default function App() {
  const { filters, setFilters } = useUrlFilters();
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const campaignId = filters.campaignId || campaigns?.[0]?.id;
  const selectedCampaign = campaigns?.find((campaign) => campaign.id === campaignId);
  const offersQuery = useOffersQuery({ ...filters, campaignId });
  const offers = useMemo(() => offersQuery.data?.pages.flatMap((page) => page.offers) ?? [], [offersQuery.data]);

  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [hideRejected, setHideRejected] = useState(false);
  const [excludedSources, setExcludedSources] = useState<Set<string>>(new Set());
  const [quaiCollapsed, setQuaiCollapsed] = useState(false);

  const displayedOffers = useMemo(() => {
    let result = offers;
    if (followUpOnly) {
      const now = new Date().toISOString();
      result = result.filter((offer) => offer.nextFollowUpAt && offer.nextFollowUpAt <= now);
    }
    if (excludedSources.size > 0) {
      result = result.filter((offer) => !excludedSources.has(offer.source));
    }
    return result;
  }, [offers, followUpOnly, excludedSources]);

  const sources = useMemo(() => Array.from(new Set(offers.map((offer) => offer.source))).sort(), [offers]);
  const toggleSource = (source: string) => {
    setExcludedSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const quaiOffers = useMemo(() => displayedOffers.filter((offer) => offer.status === "new"), [displayedOffers]);

  const toggleCampaignLocation = (label: string) => {
    if (!selectedCampaign) return;
    const all = selectedCampaign.locations.map((location) => location.label);
    setFilters((current) => ({ ...current, campaignLocations: toggleInSelection(all, current.campaignLocations, label) }));
  };

  const toggleCampaignContractType = (type: string) => {
    if (!selectedCampaign) return;
    setFilters((current) => ({
      ...current,
      campaignContractTypes: toggleInSelection(selectedCampaign.contractTypes, current.campaignContractTypes, type),
    }));
  };

  return (
    <main className="min-h-screen bg-background text-text p-6 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="font-display text-2xl text-text tracking-tight">job-harvester</h1>
      </header>

      <HarvestControl
        campaignId={campaignId ?? ""}
        onCampaignChange={(id) =>
          setFilters((current) => ({ ...current, campaignId: id, campaignLocations: undefined, campaignContractTypes: undefined }))
        }
      />
      <FilterBar filters={filters} onChange={setFilters} />
      {selectedCampaign && (
        <CampaignParamToggles
          campaign={selectedCampaign}
          selectedLocations={filters.campaignLocations}
          selectedContractTypes={filters.campaignContractTypes}
          onToggleLocation={toggleCampaignLocation}
          onToggleContractType={toggleCampaignContractType}
        />
      )}
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
      <PipelineFilters
        sources={sources}
        excludedSources={excludedSources}
        onToggleSource={toggleSource}
        hideRejected={hideRejected}
        onToggleHideRejected={() => setHideRejected((v) => !v)}
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
        <>
          <QuaiStrip
            offers={quaiOffers}
            allOffers={displayedOffers}
            collapsed={quaiCollapsed}
            onToggleCollapsed={() => setQuaiCollapsed((v) => !v)}
          />
          <PipelineBoard offers={displayedOffers} hideRejected={hideRejected} />
        </>
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
