import { z } from "zod";

export const SmartRecruitersSearchResponseSchema = z.object({
  content: z.array(z.unknown()),
  // JOB-32 : vérifié en direct (curl) — présent sur chaque réponse de liste réelle, utilisé
  // pour paginer plutôt que de supposer que la première page contient tout le catalogue.
  totalFound: z.number().optional(),
});
export type SmartRecruitersSearchResponse = z.infer<typeof SmartRecruitersSearchResponseSchema>;

export const SmartRecruitersPostingDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().optional(),
  location: z
    .object({
      city: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  company: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
  jobAd: z
    .object({
      sections: z
        .object({
          jobDescription: z
            .object({
              text: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  postingUrl: z.string().optional(),
  applyUrl: z.string().optional(),
});
export type SmartRecruitersPostingDetail = z.infer<typeof SmartRecruitersPostingDetailSchema>;

// JOB-34 : le slug d'entreprise ciblée (`company`) n'apparaît dans aucun champ de la réponse de
// détail SmartRecruiters elle-même — client.ts l'injecte donc dans ce wrapper composite pour
// que normalize.ts puisse reconstruire une URL de repli réellement valide si l'API omet un jour
// `applyUrl`/`postingUrl`.
export const SmartRecruitersRawOfferSchema = z.object({
  company: z.string(),
  detail: SmartRecruitersPostingDetailSchema,
});
export type SmartRecruitersRawOffer = z.infer<typeof SmartRecruitersRawOfferSchema>;
