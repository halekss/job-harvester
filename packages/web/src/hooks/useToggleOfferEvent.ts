import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postEvent, deleteEvent, type OfferFilters } from "../api/client.js";
import { offersQueryKey } from "./useOffersQuery.js";

export interface ToggleOfferEventVars {
  offerId: string;
  type: string;
  activeEventId?: string;
}

// Each action button reflects a single event type's presence for an offer, not one
// exclusive status - "applied" and "interview" aren't mutually exclusive, so several
// buttons can be active on the same row. Clicking toggles that one type: create an
// event when absent, delete the existing one when present.
export function useToggleOfferEvent(filters: OfferFilters) {
  const queryClient = useQueryClient();
  const queryKey = offersQueryKey(filters);

  return useMutation<void, Error, ToggleOfferEventVars>({
    mutationFn: async ({ offerId, type, activeEventId }) => {
      if (activeEventId) {
        await deleteEvent(offerId, activeEventId);
      } else {
        await postEvent(offerId, { type });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
