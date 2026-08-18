import { z } from "zod";

// JOB-31 : vérifié en direct sur `joinus.decathlon.fr` — whitelist stricte des champs utilisés
// par normalize.ts ; aucun champ de contact recruteur n'est exposé par cet endpoint.
export const DigitalRecruitersJobAdSchema = z.object({
  job_ad_id: z.number(),
  title: z.string(),
  contract: z.string().optional(),
  location: z.string().optional(),
  job: z.string().optional(),
  url: z.string(),
});
export type DigitalRecruitersJobAd = z.infer<typeof DigitalRecruitersJobAdSchema>;

export const DigitalRecruitersSearchResponseSchema = z.object({
  count: z.number().optional(),
  items: z.array(z.unknown()),
});
export type DigitalRecruitersSearchResponse = z.infer<typeof DigitalRecruitersSearchResponseSchema>;

// Le domaine cible (`joinus.{entreprise}.fr`) n'apparaît qu'implicitement (paramètre de requête
// `domainName`), jamais dans l'item lui-même — client.ts l'injecte donc dans ce wrapper composite
// pour que normalize.ts puisse reconstruire une URL de détail absolue et dériver un nom
// d'entreprise, comme smartrecruiters le fait déjà avec son slug d'entreprise (JOB-34).
export const DigitalRecruitersRawOfferSchema = z.object({
  domain: z.string(),
  item: DigitalRecruitersJobAdSchema,
});
export type DigitalRecruitersRawOffer = z.infer<typeof DigitalRecruitersRawOfferSchema>;
