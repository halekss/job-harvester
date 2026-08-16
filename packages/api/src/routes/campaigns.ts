import type { Hono } from "hono";
import type { AppDeps } from "../app.js";

// JOB-20 : le frontend a besoin de connaître les campagnes disponibles pour proposer un
// sélecteur avant de lancer une collecte, plutôt que de deviner un id de campagne en dur.
export function registerCampaignRoutes(app: Hono, { campaigns }: AppDeps): void {
  app.get("/campaigns", (c) => {
    return c.json({ campaigns: campaigns.map((campaign) => ({ id: campaign.id })) });
  });
}
