import { z } from "zod";
import { WorkdayTargetSchema } from "@job-harvester/core";

export const WorkdaySearchResponseSchema = z.object({
  total: z.number(),
  jobPostings: z.array(z.unknown()),
});
export type WorkdaySearchResponse = z.infer<typeof WorkdaySearchResponseSchema>;

export const WorkdayJobDetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string(),
    location: z.string().optional(),
    jobReqId: z.string().optional(),
    externalUrl: z.string().optional(),
  }),
});
export type WorkdayJobDetail = z.infer<typeof WorkdayJobDetailSchema>;

export const WorkdayRawOfferSchema = z.object({
  target: WorkdayTargetSchema,
  externalPath: z.string(),
  jobPostingInfo: WorkdayJobDetailSchema.shape.jobPostingInfo,
});
export type WorkdayRawOffer = z.infer<typeof WorkdayRawOfferSchema>;
