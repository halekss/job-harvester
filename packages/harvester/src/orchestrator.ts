import { ulid } from "ulid";
import { eq, and, or, desc } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { createRateLimitedFetch } from "./rate-limit/rate-limited-fetch.js";
import { buildHarvestQuery, type HarvestOverrides } from "./build-harvest-query.js";
import { reportIncident, resolveIncidentIfHealthy } from "./linear/incident-reporter.js";
import { offerMatchesQuery, acceptableDepartmentsFromLocations } from "./query-filter.js";

// Une baseline calculée sur moins de runs que ça n'est pas fiable : on préfère ne pas
// alerter plutôt que de crier au loup sur les tout premiers runs d'un connecteur.
const HEALTH_HISTORY_WINDOW = 10;
const MIN_BASELINE_RUNS = 3;
const VOLUME_DROP_RATIO = 0.5;

export async function evaluateConnectorHealth(connector: Connector, db: Db): Promise<void> {
  const recentRuns = db
    .select()
    .from(connectorRuns)
    .where(eq(connectorRuns.connectorId, connector.id))
    .orderBy(desc(connectorRuns.startedAt))
    .limit(HEALTH_HISTORY_WINDOW)
    .all();

  const [currentRun, ...previousRuns] = recentRuns;
  if (!currentRun) return;

  if (!currentRun.ok) {
    await reportIncident(
      connector.id,
      connector.tier,
      "health-check-failed",
      currentRun.errorMessage ?? `Connector run ${currentRun.id} failed with no error message.`,
    );
    return;
  }

  if (previousRuns.length >= MIN_BASELINE_RUNS) {
    const movingAverage = previousRuns.reduce((sum, run) => sum + run.normalizedCount, 0) / previousRuns.length;
    if (movingAverage > 0 && currentRun.normalizedCount < movingAverage * VOLUME_DROP_RATIO) {
      await reportIncident(
        connector.id,
        connector.tier,
        "volume-drop",
        `normalizedCount=${currentRun.normalizedCount} is below ${Math.round(VOLUME_DROP_RATIO * 100)}% of the ${previousRuns.length}-run moving average (${movingAverage.toFixed(1)}).`,
      );
      return;
    }
  }

  await resolveIncidentIfHealthy(connector.id);
}

// JOB-12 : instance partagée au niveau module — un seul jeu de seaux à jetons (par hostname)
// pour toute la durée de vie du process, afin que le rate limiting reste effectif même quand
// plusieurs campagnes (ex. mêmes horaires cron) déclenchent runCampaign() indépendamment.
const sharedGuardedFetch = createRateLimitedFetch(fetch);

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
  overrides: HarvestOverrides = {},
): Promise<RunSummary> {
  const guardedFetch = sharedGuardedFetch;
  const startedAt = new Date().toISOString();
  let rawCount = 0;
  let normalizedCount = 0;
  let rejectedCount = 0;
  let errorMessage: string | undefined;

  // Filtre ville ad-hoc (JOB-audit-2026-08-21) : une seule localisation au lieu de la boucle sur
  // toutes celles de la campagne, quand l'utilisateur a choisi une ville pour cette collecte.
  const locations = overrides.location ? [overrides.location] : campaign.locations;
  // JOB-73 : calculé une fois pour TOUT le run, pas par itération — un connecteur
  // locationScoped:false n'est fetché qu'une fois avec la première localisation (voir plus
  // bas), ses offres doivent quand même pouvoir matcher n'importe laquelle des localisations
  // couvertes par ce run, pas seulement la première.
  const acceptableDepartments = acceptableDepartmentsFromLocations(locations);
  let hasFetchedOnce = false;
  for (const location of locations) {
    const query = buildHarvestQuery(campaign, location, overrides);
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
          const matches = offerMatchesQuery(normalized, {
            contractTypes: query.contractTypes,
            keywords: query.keywords,
            acceptableDepartments,
          });
          if (!matches) {
            rejectedCount += 1;
            continue;
          }
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

  // Linear est un système d'observabilité annexe : une panne de son API (réseau, quota,
  // credentials expirés...) ne doit jamais faire échouer une campagne de collecte déjà
  // terminée. L'erreur est journalisée localement et absorbée ici, jamais propagée.
  try {
    await evaluateConnectorHealth(connector, db);
  } catch (error) {
    console.error(`[JOB-8] connector observability failed for ${connector.id}:`, error);
  }

  return { runId, rawCount, normalizedCount, rejectedCount, ok, errorMessage };
}

export async function runCampaignAcrossConnectors(
  campaign: CampaignConfig,
  connectors: Connector[],
  db: Db,
  env: Record<string, string | undefined>,
  overrides: HarvestOverrides = {},
): Promise<RunSummary[]> {
  const locations = overrides.location ? [overrides.location] : campaign.locations;
  const supportedConnectors = connectors.filter((connector) =>
    locations.some((location) => connector.supports(buildHarvestQuery(campaign, location, overrides))),
  );

  const summaries: RunSummary[] = [];
  for (const connector of supportedConnectors) {
    summaries.push(await runCampaign(campaign, connector, db, env, overrides));
  }
  return summaries;
}
