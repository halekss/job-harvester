import { z } from "zod";

export const SmartRecruitersSearchResponseSchema = z.object({
  content: z.array(z.unknown()),
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
