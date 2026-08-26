import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postEvent } from "../api/client.js";

export interface SetOfferStatusVars {
  offerId: string;
  type: string;
}

// Déplacer une carte dans le Pipeline = poser un nouvel événement du type de la voie cible.
// Pas de suppression : l'historique reste append-only, cohérent avec deriveStatus() qui ne
// regarde que l'événement le plus récent. Invalidation par préfixe ["offers"] : React Query
// matche déjà toute query ["offers", filters] quels que soient les filtres actifs, pas besoin
// de connaître les filtres actifs ici pour cibler une mise à jour optimiste.
export function useSetOfferStatus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SetOfferStatusVars>({
    mutationFn: async ({ offerId, type }) => {
      await postEvent(offerId, { type });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
