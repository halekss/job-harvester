import type { OfferFilters } from "../api/client.js";

interface FilterBarProps {
  filters: OfferFilters;
  onChange: (next: OfferFilters | ((current: OfferFilters) => OfferFilters)) => void;
}

const FIELD_CLASS =
  "bg-surface border border-border rounded-sm px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool";
const LABEL_CLASS = "text-[11px] uppercase tracking-wide text-text-muted";

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const hasActiveFilters = Boolean(filters.q || filters.city);

  return (
    <form
      role="search"
      aria-label="Filtrer les offres"
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-wrap items-end gap-3 mb-3 px-4 py-3 bg-surface border border-border rounded-md"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-q" className={LABEL_CLASS}>
          Recherche
        </label>
        <input
          id="filter-q"
          type="text"
          value={filters.q ?? ""}
          onChange={(event) => onChange((current) => ({ ...current, q: event.target.value || undefined }))}
          placeholder="Titre…"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-city" className={LABEL_CLASS}>
          Ville
        </label>
        <input
          id="filter-city"
          type="text"
          value={filters.city ?? ""}
          onChange={(event) => onChange((current) => ({ ...current, city: event.target.value || undefined }))}
          className={FIELD_CLASS}
        />
      </div>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs px-2.5 py-1.5 rounded-sm border border-border text-text-muted transition-colors duration-150 hover:border-accent-cool hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool"
        >
          Réinitialiser
        </button>
      )}
    </form>
  );
}
