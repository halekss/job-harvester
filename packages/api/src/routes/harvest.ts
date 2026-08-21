import type { Hono } from "hono";
import { z } from "zod";
import { ContractTypeSchema } from "@job-harvester/core";
import { LocationConfigSchema, runCampaignAcrossConnectors, type HarvestOverrides } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

// JOB-audit-2026-08-21 : filtres ad-hoc du bouton "Lancer la collecte" (métier/contrat/ville) -
// corps optionnel, tous les champs facultatifs. Une requête sans corps (l'appelant historique)
// se comporte exactement comme avant.
const HarvestOverridesBodySchema = z.object({
  keywords: z.array(z.string()).optional(),
  contractTypes: z.array(ContractTypeSchema).optional(),
  location: LocationConfigSchema.optional(),
});

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    let overrides: HarvestOverrides = {};
    const rawBody = await c.req.text();
    if (rawBody.trim().length > 0) {
      const parsed = HarvestOverridesBodySchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
      overrides = parsed.data;
    }

    const summaries = await runCampaignAcrossConnectors(campaign, connectors, db, env, overrides);
    // 422, pas 500 : ce n'est pas une panne serveur, la configuration de la campagne ne
    // correspond simplement à aucun connecteur enregistré (JOB-29).
    if (summaries.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    return c.json({ summaries });
  });
}
