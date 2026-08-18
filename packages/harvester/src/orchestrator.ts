import { ulid } from "ulid";
import { eq, and, or } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { createRateLimitedFetch } from "./rate-limit/rate-limited-fetch.js";
import { buildHarvestQuery } from "./build-harvest-query.js";

export interface RunSummary {
  runId: string;
  rawCount: number;
  normalizedCount: number;
  rejectedCount: number;
  ok: boolean;
  errorMessage?: string;
}

function upsertOffer(db: Db, normalized: NormalizedOffer): void {
  const exactMatch = db
    .select()
    .from(offersTable)
    .where(
      or(
        eq(offersTable.dedupKey, normalized.dedupKey),
        and(eq(offersTable.source, normalized.source), eq(offersTable.sourceOfferId, normalized.sourceOfferId)),
      ),
    )
    .get();

  if (exactMatch) {
    const merged = mergeOffers(rowToOffer(exactMatch), normalized);
    db.update(offersTable).set(offerToRow(merged)).where(eq(offersTable.id, exactMatch.id)).run();
    return;
  }

  const fuzzyMatch = db
    .select()
    .from(offersTable)
    .all()
    .map(rowToOffer)
    .find((existing) => isFuzzyDuplicate(existing, normalized));

  if (fuzzyMatch) {
    const merged = mergeOffers(fuzzyMatch, normalized);
    db.update(offersTable).set(offerToRow(merged)).where(eq(offersTable.id, merged.id)).run();
    return;
  }

  db.insert(offersTable).values(offerToRow(normalized)).run();
}

export async function runCampaign(
  campaign: CampaignConfig,
  connector: Connector,
  db: Db,
  env: Record<string, string | undefined>,
): Promise<RunSummary> {
  const guardedFetch = createRateLimitedFetch(fetch);
  const startedAt = new Date().toISOString();
  let rawCount = 0;
  let normalizedCount = 0;
  let rejectedCount = 0;
  let errorMessage: string | undefined;

  let hasFetchedOnce = false;
  for (const location of campaign.locations) {
    const query = buildHarvestQuery(campaign, location);
    if (!connector.supports(query)) continue;
    if (connector.locationScoped === false) {
      if (hasFetchedOnce) continue;
      hasFetchedOnce = true;
    }

    try {
      for await (const raw of connector.fetch(query, { fetchImpl: guardedFetch, env })) {
        rawCount += 1;
        try {
          const normalized = connector.normalize(raw);
          normalizedCount += 1;
          upsertOffer(db, normalized);
        } catch {
          rejectedCount += 1;
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const runId = ulid();
  const ok = errorMessage === undefined;
  db.insert(connectorRuns)
    .values({
      id: runId,
      connectorId: connector.id,
      campaignId: campaign.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      rawCount,
      normalizedCount,
      rejectedCount,
      httpStatusesSeen: [],
      ok,
      errorMessage,
    })
    .run();

  return { runId, rawCount, normalizedCount, rejectedCount, ok, errorMessage };
}
