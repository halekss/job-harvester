import type { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { connectorRuns } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

export function registerHealthRoutes(app: Hono, { db, connectors }: AppDeps): void {
  app.get("/connectors/health", (c) => {
    const results = connectors.map((connector) => {
      const lastRun =
        db.select().from(connectorRuns).where(eq(connectorRuns.connectorId, connector.id)).orderBy(desc(connectorRuns.finishedAt)).limit(1).get() ?? null;
      return { connectorId: connector.id, lastRun };
    });
    return c.json({ connectors: results });
  });
}
