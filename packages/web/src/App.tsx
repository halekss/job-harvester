import { useQuery } from "@tanstack/react-query";
import { getOffers } from "./api/client.js";
import { OfferTable } from "./components/OfferTable.js";
import { HarvestControl } from "./components/HarvestControl.js";

export default function App() {
  const { data: offers, isLoading, error } = useQuery({ queryKey: ["offers"], queryFn: getOffers });

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] p-6">
      <h1 className="text-xl font-semibold mb-4">job-harvester</h1>
      <HarvestControl />
      {isLoading && <p className="text-[var(--color-text-muted)]">Chargement…</p>}
      {error && <p className="text-red-400">Erreur de chargement des offres.</p>}
      {offers && <OfferTable offers={offers} />}
    </main>
  );
}
