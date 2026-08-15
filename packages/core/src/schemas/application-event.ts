import { z } from "zod";

export const ApplicationEventTypeSchema = z.enum([
  "applied",
  "spontaneous",
  "followup",
  "interview",
  "rejected",
  "no_reply",
  "archived",
]);
export type ApplicationEventType = z.infer<typeof ApplicationEventTypeSchema>;

export const ApplicationEventSchema = z.object({
  id: z.string(),
  offerId: z.string(),
  type: ApplicationEventTypeSchema,
  occurredAt: z.string(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
