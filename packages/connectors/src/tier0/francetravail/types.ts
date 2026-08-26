import { z } from "zod";

export const FranceTravailPartenaireSchema = z.object({
  nom: z.string(),
  url: z.string(),
});

export const FranceTravailOfferSchema = z.object({
  id: z.string(),
  intitule: z.string(),
  description: z.string(),
  dateCreation: z.string(),
  lieuTravail: z.object({
    libelle: z.string(),
    codePostal: z.string().optional(),
  }),
  romeCode: z.string(),
  entreprise: z
    .object({
      nom: z.string().optional(),
    })
    .optional(),
  natureContrat: z.string().optional(),
  typeContrat: z.string().optional(),
  typeContratLibelle: z.string().optional(),
  alternance: z.boolean().optional(),
  origineOffre: z.object({
    origine: z.string(),
    urlOrigine: z.string().optional(),
    partenaires: z.array(FranceTravailPartenaireSchema).optional(),
  }),
});
export type FranceTravailOffer = z.infer<typeof FranceTravailOfferSchema>;

export const FranceTravailSearchResponseSchema = z.object({
  resultats: z.array(z.unknown()),
});
export type FranceTravailSearchResponse = z.infer<typeof FranceTravailSearchResponseSchema>;
