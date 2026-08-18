import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { postEvent, type OfferFilters, type OffersPage } from "../api/client.js";
import { offersQueryKey } from "./useOffersQuery.js";

export interface OfferEventMutationVars {
  offerIds: string[];
  type: string;
}

interface MutationContext {
  previous: InfiniteData<OffersPage> | undefined;
}

function clearFollowUp(
  data: InfiniteData<OffersPage> | undefined,
  offerIds: Set<string>,
): InfiniteData<OffersPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      offers: page.offers.map((offer) => (offerIds.has(offer.id) ? { ...offer, nextFollowUpAt: null } : offer)),
    })),
  };
}

export function useOfferEventMutation(filters: OfferFilters) {
  const queryClient = useQueryClient();
  const queryKey = offersQueryKey(filters);

  return useMutation<void, Error, OfferEventMutationVars, MutationContext>({
    mutationFn: async ({ offerIds, type }) => {
      await Promise.all(offerIds.map((offerId) => postEvent(offerId, { type })));
    },
    onMutate: async ({ offerIds, type }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<OffersPage>>(queryKey);
      if (type === "followup") {
        queryClient.setQueryData<InfiniteData<OffersPage>>(queryKey, (data) =>
          clearFollowUp(data, new Set(offerIds)),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
