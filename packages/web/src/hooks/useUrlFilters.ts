import { useCallback, useEffect, useState } from "react";
import type { OfferFilters } from "../api/client.js";

const FILTER_KEYS: Array<keyof OfferFilters> = ["city", "contractType", "q", "campaignId"];

function readFiltersFromLocation(): OfferFilters {
  const params = new URLSearchParams(window.location.search);
  const filters: OfferFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return filters;
}

function filtersToSearch(filters: OfferFilters): string {
  const params = new URLSearchParams(window.location.search);
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useUrlFilters(): {
  filters: OfferFilters;
  setFilters: (next: OfferFilters | ((current: OfferFilters) => OfferFilters)) => void;
} {
  const [filters, setFiltersState] = useState<OfferFilters>(() => readFiltersFromLocation());

  useEffect(() => {
    const onPopState = () => setFiltersState(readFiltersFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setFilters = useCallback((next: OfferFilters | ((current: OfferFilters) => OfferFilters)) => {
    setFiltersState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      const search = filtersToSearch(resolved);
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      window.history.pushState(null, "", url);
      return resolved;
    });
  }, []);

  return { filters, setFilters };
}
