import { z } from "zod";

export const LbaGeoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const LbaOfferSchema = z.object({
  identifier: z.object({
    id: z.string().nullable(),
    partner_job_id: z.string(),
    partner_label: z.string(),
  }),
  workplace: z.object({
    name: z.string().nullable(),
    legal_name: z.string().nullable(),
    website: z.string().nullable(),
    siret: z.string().nullable(),
    location: z.object({
      address: z.string(),
      geopoint: LbaGeoPointSchema,
    }),
  }),
  apply: z.object({
    url: z.string(),
  }),
  contract: z.object({
    start: z.string().nullable(),
    duration: z.number().nullable(),
    type: z.array(z.enum(["Apprentissage", "Professionnalisation"])),
    remote: z.enum(["onsite", "remote", "hybrid"]).nullable(),
  }),
  offer: z.object({
    title: z.string(),
    description: z.string(),
    rome_codes: z.array(z.string()),
    publication: z.object({
      creation: z.string().nullable(),
      expiration: z.string().nullable(),
    }),
    status: z.enum(["Active", "Filled", "Cancelled"]),
  }),
});
export type LbaOffer = z.infer<typeof LbaOfferSchema>;

export const LbaSearchResponseSchema = z.object({
  jobs: z.array(z.unknown()),
  recruiters: z.array(z.unknown()),
  warnings: z.array(z.object({ message: z.string(), code: z.string() })),
});
export type LbaSearchResponse = z.infer<typeof LbaSearchResponseSchema>;
