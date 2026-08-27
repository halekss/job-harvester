import { useCallback, useEffect, useState } from "react";
import type { OfferFilters } from "../api/client.js";

const FILTER_KEYS = ["campaignId"] as const;
// Stockées en CSV dans l'URL, comme envoyé à l'API (voir getOffers) — un tableau vide (tout
// décoché via CampaignParamToggles) doit rester distinguable de l'absence du paramètre.
const ARRAY_FILTER_KEYS = ["campaignLocations", "campaignContractTypes"] as const;

function readFiltersFromLocation(): OfferFilters {
  const params = new URLSearchParams(window.location.search);
  const filters: OfferFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  for (const key of ARRAY_FILTER_KEYS) {
    const raw = params.get(key);
    if (raw !== null) filters[key] = raw === "" ? [] : raw.split(",");
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
  for (const key of ARRAY_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value.join(","));
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
