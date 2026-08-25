import type { Hono } from "hono";
import { runCampaignAcrossConnectors, discoverTargets, type DiscoveredTarget } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env, campaignsFilePath, discoveryFetchImpl }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const summaries = await runCampaignAcrossConnectors(campaign, connectors, db, env);
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
