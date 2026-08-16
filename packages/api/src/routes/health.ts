import type { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { connectorRuns } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

export function registerHealthRoutes(app: Hono, { db, connectors }: AppDeps): void {
  app.get("/connectors/health", async (c) => {
    // JOB-16 : `lastRun` (l'historique en base) est complété par `live` (un vrai appel
    // `connector.healthCheck()` à l'instant de la requête) — auparavant seul l'historique était
    // renvoyé sous le nom "health", ce qui ne reflétait jamais la joignabilité live du connecteur.
    const results = await Promise.all(
      connectors.map(async (connector) => {
        const lastRun =
          db.select().from(connectorRuns).where(eq(connectorRuns.connectorId, connector.id)).orderBy(desc(connectorRuns.finishedAt)).limit(1).get() ?? null;
        const live = await connector.healthCheck();
        return { connectorId: connector.id, lastRun, live };
      }),
    );
    return c.json({ connectors: results });
  });
}
