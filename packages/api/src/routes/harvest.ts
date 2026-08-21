import type { Hono } from "hono";
import { z } from "zod";
import { ContractTypeSchema } from "@job-harvester/core";
import {
  LocationConfigSchema,
  discoverTargets,
  runCampaignAcrossConnectors,
  type DiscoveredTarget,
  type HarvestOverrides,
} from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

// JOB-audit-2026-08-21 : filtres ad-hoc du bouton "Lancer la collecte" (métier/contrat/ville) -
// corps optionnel, tous les champs facultatifs. Une requête sans corps (l'appelant historique)
// se comporte exactement comme avant.
const HarvestOverridesBodySchema = z.object({
  keywords: z.array(z.string()).optional(),
  contractTypes: z.array(ContractTypeSchema).optional(),
  location: LocationConfigSchema.optional(),
});

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env, campaignsFilePath, discoveryFetchImpl }: AppDeps): void {
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

    // Découverte de cibles : uniquement quand le chemin du fichier de campagnes est fourni
    // (jamais en test sans configuration explicite, jamais sur le cron — voir server.ts).
    // Jamais bloquant si un sondage échoue : à ce stade la collecte a déjà réussi et ses
    // résultats sont déjà persistés en base, donc une erreur de découverte ne doit jamais
    // faire échouer la réponse HTTP.
    let discoveries: { probed: number; found: DiscoveredTarget[] } = { probed: 0, found: [] };
    if (campaignsFilePath) {
      try {
        discoveries = await discoverTargets(db, campaignsFilePath, { fetchImpl: discoveryFetchImpl });
      } catch (err) {
        console.error("[discovery] échec non bloquant :", err);
      }
    }

    return c.json({ summaries, discoveries });
  });
}
