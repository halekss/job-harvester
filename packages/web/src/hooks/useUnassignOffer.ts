import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteEvent } from "../api/client.js";

export interface UnassignOfferVars {
  offerId: string;
  eventId: string;
}

// Repositionner une carte du Pipeline vers le Quai : contrairement à un déplacement entre voies
// (useSetOfferStatus, append-only — voir son commentaire), il n'existe pas de type d'événement
// "new" à poser (ApplicationEventTypeSchema ne le liste pas) : l'absence totale d'événement EST
// le statut "new" (deriveStatus()). On supprime donc l'événement qui a produit le statut actuel
// de la carte — son id est déjà connu via activeEvents[status] (GET /offers), pas besoin d'un
// aller-retour réseau pour le retrouver.
export function useUnassignOffer() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UnassignOfferVars>({
    mutationFn: async ({ offerId, eventId }) => {
      await deleteEvent(offerId, eventId);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}
