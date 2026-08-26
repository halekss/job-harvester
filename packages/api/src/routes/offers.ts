import type { Hono } from "hono";
import { and, desc, eq, inArray, isNotNull, like, sql, type SQL } from "drizzle-orm";
import { offers as offersTable, applicationEvents, rowToOffer, type OfferRow } from "@job-harvester/db";
import type { Db } from "@job-harvester/db";
import { offerMatchesQuery, queryFilterFromCampaign, type QueryFilter } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

const PAGE_SIZE = 50;

function encodeCursor(row: { postedAt: string | null; firstSeenAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ postedAt: row.postedAt, firstSeenAt: row.firstSeenAt, id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { postedAt: string | null; firstSeenAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

export function deriveStatus(events: { type: string; occurredAt: string }[]): string {
  if (events.length === 0) return "new";
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!.type;
}

function nextFollowUpByOfferId(db: Db, offerIds: string[]): Map<string, string> {
  if (offerIds.length === 0) return new Map();
  const rows = db
    .select({ offerId: applicationEvents.offerId, nextFollowUpAt: applicationEvents.nextFollowUpAt })
    .from(applicationEvents)
    .where(and(inArray(applicationEvents.offerId, offerIds), isNotNull(applicationEvents.nextFollowUpAt)))
    .all();
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!row.nextFollowUpAt) continue;
    const current = result.get(row.offerId);
    if (!current || row.nextFollowUpAt < current) result.set(row.offerId, row.nextFollowUpAt);
  }
  return result;
}

// Latest event id per (offer, type) — lets the UI show several action buttons as
// active at once for one offer (applied + interview aren't mutually exclusive),
// and gives it the event id it needs to toggle a button off via DELETE.
function activeEventsByOfferId(db: Db, offerIds: string[]): Map<string, Record<string, string>> {
  const result = new Map<string, Record<string, string>>();
  if (offerIds.length === 0) return result;
  const rows = db
    .select({
      offerId: applicationEvents.offerId,
      type: applicationEvents.type,
      id: applicationEvents.id,
      occurredAt: applicationEvents.occurredAt,
    })
    .from(applicationEvents)
    .where(inArray(applicationEvents.offerId, offerIds))
    .all();
  const latestOccurredAt = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.offerId} ${row.type}`;
    const current = latestOccurredAt.get(key);
    if (current && row.occurredAt <= current) continue;
    latestOccurredAt.set(key, row.occurredAt);
    const forOffer = result.get(row.offerId) ?? {};
    forOffer[row.type] = row.id;
    result.set(row.offerId, forOffer);
  }
  return result;
}

// Statut courant = type de l'événement le plus récent, tous types confondus (même algorithme
// que deriveStatus(), déjà utilisé par GET /offers/:id et GET /stats) — c'est ce qui détermine
// la voie du Pipeline dans laquelle une offre apparaît côté web.
function statusByOfferId(db: Db, offerIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (offerIds.length === 0) return result;
  const rows = db
    .select({
      offerId: applicationEvents.offerId,
      type: applicationEvents.type,
      occurredAt: applicationEvents.occurredAt,
    })
    .from(applicationEvents)
    .where(inArray(applicationEvents.offerId, offerIds))
    .all();
  const eventsByOfferId = new Map<string, { type: string; occurredAt: string }[]>();
  for (const row of rows) {
    const list = eventsByOfferId.get(row.offerId) ?? [];
    list.push({ type: row.type, occurredAt: row.occurredAt });
    eventsByOfferId.set(row.offerId, list);
  }
  for (const offerId of offerIds) {
    result.set(offerId, deriveStatus(eventsByOfferId.get(offerId) ?? []));
  }
  return result;
}

// Le but du jobboard est d'afficher les offres correspondant à la recherche de l'utilisateur,
// pas tout l'historique jamais collecté (audit 2026-08-26) : quand une campagne est sélectionnée,
// on réévalue chaque offre stockée avec la MÊME logique que l'écriture (offerMatchesQuery), pour
// ne montrer que celles qui correspondent réellement à ses critères actuels (mots-clés/
// contrat/localisations). Une offre qui ne matche plus (campagne modifiée, filtre resserré
// depuis sa collecte...) disparaît de la vue sans jamais être supprimée de la base.
function fetchOffersPage(
  db: Db,
  baseConditions: (SQL | undefined)[],
  campaignFilter: QueryFilter | undefined,
  cursorParam: string | undefined,
): { rows: OfferRow[]; nextCursor: string | null } {
  const matched: OfferRow[] = [];
  let cursor = cursorParam;
  let exhausted = false;

  while (matched.length < PAGE_SIZE && !exhausted) {
    const conditions = [
      ...baseConditions,
      cursor
        ? (() => {
            const c = decodeCursor(cursor!);
            return sql`(COALESCE(${offersTable.postedAt}, ${offersTable.firstSeenAt}), ${offersTable.firstSeenAt}, ${offersTable.id}) < (COALESCE(${c.postedAt}, ${c.firstSeenAt}), ${c.firstSeenAt}, ${c.id})`;
          })()
        : undefined,
    ].filter((condition) => condition !== undefined);

    const rows = db
      .select()
      .from(offersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sql`COALESCE(${offersTable.postedAt}, ${offersTable.firstSeenAt})`), desc(offersTable.firstSeenAt), desc(offersTable.id))
      .limit(PAGE_SIZE)
      .all();

    if (rows.length === 0) {
      exhausted = true;
      break;
    }

    for (const row of rows) {
      if (!campaignFilter || offerMatchesQuery(rowToOffer(row), campaignFilter)) {
        matched.push(row);
        if (matched.length === PAGE_SIZE) break;
      }
    }
    cursor = encodeCursor(rows.at(-1)!);
    if (rows.length < PAGE_SIZE) exhausted = true;
  }

  return { rows: matched, nextCursor: exhausted ? null : (cursor ?? null) };
}

export function registerOfferRoutes(app: Hono, { db, campaigns }: AppDeps): void {
  app.get("/offers", (c) => {
    const city = c.req.query("city");
    const contractType = c.req.query("contractType");
    const q = c.req.query("q");
    const campaignId = c.req.query("campaignId");
    const cursorParam = c.req.query("cursor");

    const campaign = campaignId ? campaigns.find((cmp) => cmp.id === campaignId) : undefined;
    const campaignFilter = campaign ? queryFilterFromCampaign(campaign) : undefined;

    const baseConditions = [
      city ? eq(offersTable.city, city) : undefined,
      contractType ? eq(offersTable.contractType, contractType) : undefined,
      q ? like(offersTable.title, `%${q}%`) : undefined,
    ];

    const { rows, nextCursor } = fetchOffersPage(db, baseConditions, campaignFilter, cursorParam);

    const offerIds = rows.map((row) => row.id);
    const followUps = nextFollowUpByOfferId(db, offerIds);
    const activeEvents = activeEventsByOfferId(db, offerIds);
    const statuses = statusByOfferId(db, offerIds);
    const offers = rows.map((row) => ({
      ...rowToOffer(row),
      nextFollowUpAt: followUps.get(row.id) ?? null,
      activeEvents: activeEvents.get(row.id) ?? {},
      status: statuses.get(row.id) ?? "new",
    }));
    return c.json({ offers, nextCursor });
  });

  app.get("/offers/:id", (c) => {
    const row = db.select().from(offersTable).where(eq(offersTable.id, c.req.param("id"))).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    const events = db.select().from(applicationEvents).where(eq(applicationEvents.offerId, row.id)).all();
    return c.json({ offer: rowToOffer(row), status: deriveStatus(events), events });
  });
}
