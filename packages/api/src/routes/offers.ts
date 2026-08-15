import type { Hono } from "hono";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { offers as offersTable, applicationEvents, rowToOffer } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

const PAGE_SIZE = 50;

function encodeCursor(row: { postedAt: string | null; firstSeenAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ postedAt: row.postedAt, firstSeenAt: row.firstSeenAt, id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { postedAt: string | null; firstSeenAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

function deriveStatus(events: { type: string; occurredAt: string }[]): string {
  if (events.length === 0) return "new";
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!.type;
}

export function registerOfferRoutes(app: Hono, { db }: AppDeps): void {
  app.get("/offers", (c) => {
    const city = c.req.query("city");
    const contractType = c.req.query("contractType");
    const q = c.req.query("q");
    const cursorParam = c.req.query("cursor");

    const conditions = [
      city ? eq(offersTable.city, city) : undefined,
      contractType ? eq(offersTable.contractType, contractType) : undefined,
      q ? like(offersTable.title, `%${q}%`) : undefined,
      cursorParam
        ? (() => {
            const cursor = decodeCursor(cursorParam);
            return sql`(COALESCE(${offersTable.postedAt}, ${offersTable.firstSeenAt}), ${offersTable.firstSeenAt}, ${offersTable.id}) < (COALESCE(${cursor.postedAt}, ${cursor.firstSeenAt}), ${cursor.firstSeenAt}, ${cursor.id})`;
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

    const nextCursor = rows.length === PAGE_SIZE ? encodeCursor(rows.at(-1)!) : null;
    return c.json({ offers: rows.map(rowToOffer), nextCursor });
  });

  app.get("/offers/:id", (c) => {
    const row = db.select().from(offersTable).where(eq(offersTable.id, c.req.param("id"))).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    const events = db.select().from(applicationEvents).where(eq(applicationEvents.offerId, row.id)).all();
    return c.json({ offer: rowToOffer(row), status: deriveStatus(events), events });
  });
}
