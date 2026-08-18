import { useInfiniteQuery } from "@tanstack/react-query";
import { getOffers, type OfferFilters } from "../api/client.js";

export function offersQueryKey(filters: OfferFilters) {
  return ["offers", filters] as const;
}

export function useOffersQuery(filters: OfferFilters) {
  return useInfiniteQuery({
    queryKey: offersQueryKey(filters),
    queryFn: ({ pageParam }) => getOffers(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
