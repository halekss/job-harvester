import { z } from "zod";

// Whitelists the standard schema.org/JobPosting fields job-harvester actually uses. Anything
// else present in a page's JSON-LD (including any recruiter contact block) is stripped by Zod's
// default "strip unknown keys" behavior — same anti-PII posture as the other connectors.
export const JobPostingSchema = z.object({
  title: z.string(),
  description: z.string(),
  datePosted: z.string().optional(),
  validThrough: z.string().optional(),
  hiringOrganization: z.object({ name: z.string().optional() }).optional(),
  jobLocation: z
    .object({
      address: z
        .object({
          addressLocality: z.string().optional(),
          postalCode: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  employmentType: z.union([z.string(), z.array(z.string())]).optional(),
  identifier: z.object({ value: z.string().optional() }).optional(),
  // Not in the schema.org fields the ticket names explicitly, but needed to build a per-offer
  // canonical URL: a career page can embed several JobPosting entries (via @graph or an array),
  // each pointing at its own job detail page. Falls back to the page URL when absent.
  url: z.string().optional(),
});
export type JobPosting = z.infer<typeof JobPostingSchema>;

export const JsonLdRawOfferSchema = z.object({
  pageUrl: z.string(),
  jobPosting: JobPostingSchema,
});
export type JsonLdRawOffer = z.infer<typeof JsonLdRawOfferSchema>;
