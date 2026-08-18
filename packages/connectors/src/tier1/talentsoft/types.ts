import { z } from "zod";

export const TalentsoftRssItemSchema = z.object({
  link: z.string(),
  title: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
});
export type TalentsoftRssItem = z.infer<typeof TalentsoftRssItemSchema>;

// The RSS handler itself carries no domain — client.ts injects the target domain into this
// composite wrapper so normalize.ts can derive a company name and rebuild an absolute canonical
// URL from a relative one, the same pattern smartrecruiters/digitalrecruiters use for their
// respective per-company slugs (JOB-34).
export const TalentsoftRawOfferSchema = z.object({
  domain: z.string(),
  item: TalentsoftRssItemSchema,
});
export type TalentsoftRawOffer = z.infer<typeof TalentsoftRawOfferSchema>;
