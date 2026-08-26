interface PipelineFiltersProps {
  sources: string[];
  excludedSources: Set<string>;
  onToggleSource: (source: string) => void;
  hideRejected: boolean;
  onToggleHideRejected: () => void;
}

// Filtres client uniquement, appliqués sur la page déjà chargée (comme "à relancer uniquement"
// dans App.tsx) — pas de paramètre d'API supplémentaire pour ce lot.
export function PipelineFilters({ sources, excludedSources, onToggleSource, hideRejected, onToggleHideRejected }: PipelineFiltersProps) {
  return (
    <div role="group" aria-label="Filtres du pipeline" className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      {sources.map((source) => {
        const pressed = !excludedSources.has(source);
        return (
          <button
            key={source}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggleSource(source)}
            className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool ${
              pressed ? "border-accent/40 text-text" : "border-border text-text-faint opacity-50"
            }`}
          >
            {source}
          </button>
        );
      })}
      <button
        type="button"
        role="switch"
        aria-checked={hideRejected}
        aria-label="Masquer les refus"
        onClick={onToggleHideRejected}
        className={`ml-auto rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-cool ${
          hideRejected ? "border-status-rejected-solid bg-status-rejected-bg text-status-rejected-fg" : "border-border text-text-muted"
        }`}
      >
        Masquer les refus
      </button>
    </div>
  );
}
