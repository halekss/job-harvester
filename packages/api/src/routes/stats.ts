import type { Hono } from "hono";
import { offers as offersTable, applicationEvents } from "@job-harvester/db";
import type { AppDeps } from "../app.js";
import { deriveStatus } from "./offers.js";

const RESPONDED_TYPES = new Set(["interview", "rejected"]);
const APPLIED_TYPES = new Set(["applied", "spontaneous"]);

export function registerStatsRoutes(app: Hono, { db }: AppDeps): void {
  app.get("/stats", (c) => {
    const offers = db.select({ id: offersTable.id, source: offersTable.source }).from(offersTable).all();
    const events = db
      .select({ offerId: applicationEvents.offerId, type: applicationEvents.type, occurredAt: applicationEvents.occurredAt })
      .from(applicationEvents)
      .all();

    const eventsByOfferId = new Map<string, { type: string; occurredAt: string }[]>();
    for (const event of events) {
      const list = eventsByOfferId.get(event.offerId) ?? [];
      list.push({ type: event.type, occurredAt: event.occurredAt });
      eventsByOfferId.set(event.offerId, list);
    }

    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let appliedCount = 0;
    let respondedCount = 0;

    for (const offer of offers) {
      bySource[offer.source] = (bySource[offer.source] ?? 0) + 1;

      const offerEvents = eventsByOfferId.get(offer.id) ?? [];
      const status = deriveStatus(offerEvents);
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      // JOB-15 : le taux de réponse compare les offres "postulées" (applied/spontaneous) à celles
      // ayant reçu une réponse (interview/rejected) — indépendamment du statut dérivé courant, qui
      // ne reflète que le dernier event.
      if (offerEvents.some((event) => APPLIED_TYPES.has(event.type))) appliedCount += 1;
      if (offerEvents.some((event) => RESPONDED_TYPES.has(event.type))) respondedCount += 1;
    }

    const responseRate = appliedCount > 0 ? respondedCount / appliedCount : null;

    return c.json({
      bySource,
      byStatus,
      responseRate: { applied: appliedCount, responded: respondedCount, rate: responseRate },
    });
  });
}
