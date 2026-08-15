import type { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { applicationEvents } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

const CreateEventBodySchema = z.object({
  type: z.enum(["applied", "spontaneous", "followup", "interview", "rejected", "no_reply", "archived"]),
  occurredAt: z.string().optional(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});

export function registerEventRoutes(app: Hono, { db }: AppDeps): void {
  app.post("/offers/:id/events", async (c) => {
    const parsed = CreateEventBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const event = {
      id: ulid(),
      offerId: c.req.param("id"),
      type: parsed.data.type,
      occurredAt: parsed.data.occurredAt ?? new Date().toISOString(),
      channel: parsed.data.channel,
      notes: parsed.data.notes,
      nextFollowUpAt: parsed.data.nextFollowUpAt,
    };
    db.insert(applicationEvents).values(event).run();
    return c.json({ event }, 201);
  });
}
