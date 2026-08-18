import { sql, eq } from "drizzle-orm";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { createDb } from "../client.js";
import { offers, applicationEvents } from "../schema.js";

export interface RecomputeOfferIdsResult {
  totalOffers: number;
  updatedOffers: number;
}

export function recomputeOfferIds(dbPath: string): RecomputeOfferIdsResult {
  const db = createDb(dbPath);
  const rows = db.select({ id: offers.id, source: offers.source, sourceOfferId: offers.sourceOfferId }).from(offers).all();
  const stale = rows
    .map((row) => ({ oldId: row.id, newId: exactDedupKeyFromSource(row.source, row.sourceOfferId) }))
    .filter(({ oldId, newId }) => oldId !== newId);

  if (stale.length > 0) {
    const newIdCounts = new Map<string, number>();
    for (const { newId } of stale) newIdCounts.set(newId, (newIdCounts.get(newId) ?? 0) + 1);
    const duplicateNewIds = [...newIdCounts.entries()].filter(([, count]) => count > 1).map(([newId]) => newId);
    if (duplicateNewIds.length > 0) {
      throw new Error(
        `recomputeOfferIds found duplicate (source, sourceOfferId) pairs among existing offers, refusing to proceed: ${duplicateNewIds.join(", ")}`,
      );
    }

    // JOB-10 : SQLite ne permet pas de changer PRAGMA foreign_keys au sein d'une transaction,
    // et renommer un id référencé par une FK NO ACTION violerait la contrainte à mi-parcours
    // sinon (l'événement pointerait transitoirement vers un id qui n'existe plus encore).
    db.run(sql`PRAGMA foreign_keys = OFF`);
    try {
      db.transaction((tx) => {
        for (const { oldId, newId } of stale) {
          tx.update(applicationEvents).set({ offerId: newId }).where(eq(applicationEvents.offerId, oldId)).run();
          tx.update(offers).set({ id: newId }).where(eq(offers.id, oldId)).run();
        }
      });
      const orphans = db.all(sql`PRAGMA foreign_key_check`);
      if (orphans.length > 0) {
        throw new Error(`recomputeOfferIds left ${orphans.length} orphaned row(s), aborting: ${JSON.stringify(orphans)}`);
      }
    } finally {
      db.run(sql`PRAGMA foreign_keys = ON`);
    }
  }

  return { totalOffers: rows.length, updatedOffers: stale.length };
}

if (process.argv[1]?.endsWith("recompute-offer-ids.ts") || process.argv[1]?.endsWith("recompute-offer-ids.js")) {
  const [, , dbPath] = process.argv;
  if (!dbPath) throw new Error("usage: recompute-offer-ids.ts <dbPath>");
  const result = recomputeOfferIds(dbPath);
  console.log(`${result.updatedOffers}/${result.totalOffers} offer id(s) recomputed`);
}
