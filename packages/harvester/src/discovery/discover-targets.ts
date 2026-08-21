import { ulid } from "ulid";
import { offers as offersTable, discoveryProbes, type Db } from "@job-harvester/db";
import { companySlug } from "./slug.js";
import { probeDigitalRecruiters } from "./probe-digitalrecruiters.js";
import { probeSmartRecruiters } from "./probe-smartrecruiters.js";
import { probeTalentsoft } from "./probe-talentsoft.js";
import { probeWorkday } from "./probe-workday.js";
import { addTargetToCampaigns, type DiscoveryPlatform, type DiscoveryTarget } from "./write-campaigns-yaml.js";
import { createRateLimitedFetch } from "../rate-limit/rate-limited-fetch.js";

const DEFAULT_LIMIT = 20;

// Même politesse/throttling que le reste du package (JOB-12) : sans ça, jusqu'à ~20 entreprises
// x 4 plateformes tapent les mêmes hôtes (api.digitalrecruiters.com, api.smartrecruiters.com...)
// sans aucune limitation, ce qui est impoli et risque un blocage IP sur des plateformes dont
// dépendent aussi des connecteurs de production. Instance partagée au niveau module, comme
// orchestrator.ts.
const sharedGuardedFetch = createRateLimitedFetch(fetch);
const ALL_PLATFORMS: DiscoveryPlatform[] = ["digitalRecruiters", "smartrecruiters", "talentsoft", "workday"];

function probeKey(slug: string, platform: DiscoveryPlatform): string {
  return `${slug}::${platform}`;
}

export interface DiscoveredTarget {
  companySlug: string;
  platform: DiscoveryPlatform;
  target: DiscoveryTarget;
}

export interface DiscoverySummary {
  probed: number;
  found: DiscoveredTarget[];
}

export interface DiscoverTargetsOptions {
  fetchImpl?: typeof fetch;
  limit?: number;
}

async function safeProbe<T>(probe: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await probe();
  } catch {
    return undefined;
  }
}

function recordProbe(db: Db, slug: string, platform: DiscoveryPlatform, target: DiscoveryTarget | undefined): void {
  db.insert(discoveryProbes)
    .values({
      id: ulid(),
      companySlug: slug,
      platform,
      found: target !== undefined,
      target: target ?? null,
      probedAt: new Date().toISOString(),
    })
    .run();
}

export async function discoverTargets(
  db: Db,
  campaignsFilePath: string,
  options: DiscoverTargetsOptions = {},
): Promise<DiscoverySummary> {
  const fetchImpl = options.fetchImpl ?? sharedGuardedFetch;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const allSlugs = new Set(
    db
      .selectDistinct({ companyName: offersTable.companyName })
      .from(offersTable)
      .all()
      .map((row) => companySlug(row.companyName)),
  );
  // Clé composite (entreprise, plateforme) : une entreprise n'est plus jamais resondée SUR UNE
  // PLATEFORME DONNÉE une fois qu'une ligne existe pour cette paire — mais un run interrompu
  // (crash entre deux plateformes, ou une découverte qui a échoué avant le fix JOB-audit-2026-08-21)
  // ne doit pas exclure définitivement les plateformes encore manquantes.
  const probedPairs = new Set(
    db
      .select({ companySlug: discoveryProbes.companySlug, platform: discoveryProbes.platform })
      .from(discoveryProbes)
      .all()
      .map((row) => probeKey(row.companySlug, row.platform as DiscoveryPlatform)),
  );
  const isFullyProbed = (slug: string): boolean => ALL_PLATFORMS.every((platform) => probedPairs.has(probeKey(slug, platform)));

  const toProbe = Array.from(allSlugs)
    .filter((slug) => slug.length > 0)
    .filter((slug) => !isFullyProbed(slug))
    .slice(0, limit);

  const found: DiscoveredTarget[] = [];

  for (const slug of toProbe) {
    if (!probedPairs.has(probeKey(slug, "digitalRecruiters"))) {
      const digitalRecruiters = await safeProbe(() => probeDigitalRecruiters(slug, fetchImpl));
      recordProbe(db, slug, "digitalRecruiters", digitalRecruiters);
      if (digitalRecruiters) {
        found.push({ companySlug: slug, platform: "digitalRecruiters", target: digitalRecruiters });
        addTargetToCampaigns(campaignsFilePath, "digitalRecruiters", digitalRecruiters);
      }
    }

    if (!probedPairs.has(probeKey(slug, "smartrecruiters"))) {
      const smartrecruiters = await safeProbe(() => probeSmartRecruiters(slug, fetchImpl));
      recordProbe(db, slug, "smartrecruiters", smartrecruiters);
      if (smartrecruiters) {
        found.push({ companySlug: slug, platform: "smartrecruiters", target: smartrecruiters });
        addTargetToCampaigns(campaignsFilePath, "smartrecruiters", smartrecruiters);
      }
    }

    if (!probedPairs.has(probeKey(slug, "talentsoft"))) {
      const talentsoft = await safeProbe(() => probeTalentsoft(slug, fetchImpl));
      recordProbe(db, slug, "talentsoft", talentsoft);
      if (talentsoft) {
        found.push({ companySlug: slug, platform: "talentsoft", target: talentsoft });
        addTargetToCampaigns(campaignsFilePath, "talentsoft", talentsoft);
      }
    }

    if (!probedPairs.has(probeKey(slug, "workday"))) {
      const workday = await safeProbe(() => probeWorkday(slug, fetchImpl));
      recordProbe(db, slug, "workday", workday);
      if (workday) {
        found.push({ companySlug: slug, platform: "workday", target: workday });
        addTargetToCampaigns(campaignsFilePath, "workday", workday);
      }
    }
  }

  return { probed: toProbe.length, found };
}
