import { z } from "zod";

// JOB-31 : vérifié en direct (requête réelle contre `wk_cms_jobs_production`) — whitelist
// stricte des champs consommés par normalize.ts. Aucun champ de contact recruteur n'existe dans
// cet index (il ne renvoie que des données publiques d'offre/entreprise).
export const WttjJobHitSchema = z.object({
  objectID: z.string(),
  slug: z.string(),
  name: z.string(),
  profile: z.string().nullable().optional(),
  published_at: z.string().optional(),
  reference: z.string().optional(),
  organization: z.object({
    name: z.string(),
    slug: z.string(),
  }),
  contract_type: z.string().optional(),
  contract_type_names: z
    .object({
      fr: z.string().optional(),
    })
    .partial()
    .optional(),
  contract_duration_minimum: z.number().nullable().optional(),
  office: z
    .object({
      city: z.string().optional(),
      country_code: z.string().optional(),
    })
    .nullable()
    .optional(),
  remote: z.string().nullable().optional(),
  _geoloc: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
});
export type WttjJobHit = z.infer<typeof WttjJobHitSchema>;

export const WttjSearchResponseSchema = z.object({
  hits: z.array(z.unknown()),
  nbHits: z.number(),
  page: z.number(),
  nbPages: z.number(),
});
export type WttjSearchResponse = z.infer<typeof WttjSearchResponseSchema>;
