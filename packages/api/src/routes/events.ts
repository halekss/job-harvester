import type { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ApplicationEventTypeSchema } from "@job-harvester/core";
import { applicationEvents, offers as offersTable } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

const CreateEventBodySchema = z.object({
  type: ApplicationEventTypeSchema,
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
    const offerId = c.req.param("id");
    // JOB-11 : sans cette vérification, un id d'offre invalide (typo, offre supprimée) créerait
    // soit une violation FK brute (PRAGMA foreign_keys activé) soit, avant ce fix, un événement
    // orphelin silencieux.
    const offer = db.select({ id: offersTable.id }).from(offersTable).where(eq(offersTable.id, offerId)).get();
    if (!offer) {
      return c.json({ error: "offer_not_found" }, 404);
    }
    const event = {
      id: ulid(),
      offerId,
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
