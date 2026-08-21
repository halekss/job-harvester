import { ulid } from "ulid";
import { offers as offersTable, discoveryProbes, type Db } from "@job-harvester/db";
import { companySlug } from "./slug.js";
import { probeDigitalRecruiters } from "./probe-digitalrecruiters.js";
import { probeSmartRecruiters } from "./probe-smartrecruiters.js";
import { probeTalentsoft } from "./probe-talentsoft.js";
import { probeWorkday } from "./probe-workday.js";
import { addTargetToCampaigns, type DiscoveryPlatform, type DiscoveryTarget } from "./write-campaigns-yaml.js";

const DEFAULT_LIMIT = 20;

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
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const allSlugs = new Set(
    db
      .selectDistinct({ companyName: offersTable.companyName })
      .from(offersTable)
      .all()
      .map((row) => companySlug(row.companyName)),
  );
  const alreadyProbed = new Set(
    db.selectDistinct({ companySlug: discoveryProbes.companySlug }).from(discoveryProbes).all().map((row) => row.companySlug),
  );
  const toProbe = Array.from(allSlugs)
    .filter((slug) => !alreadyProbed.has(slug))
    .slice(0, limit);

  const found: DiscoveredTarget[] = [];

  for (const slug of toProbe) {
    const digitalRecruiters = await probeDigitalRecruiters(slug, fetchImpl);
    recordProbe(db, slug, "digitalRecruiters", digitalRecruiters);
    if (digitalRecruiters) {
      found.push({ companySlug: slug, platform: "digitalRecruiters", target: digitalRecruiters });
      addTargetToCampaigns(campaignsFilePath, "digitalRecruiters", digitalRecruiters);
    }

    const smartrecruiters = await probeSmartRecruiters(slug, fetchImpl);
    recordProbe(db, slug, "smartrecruiters", smartrecruiters);
    if (smartrecruiters) {
      found.push({ companySlug: slug, platform: "smartrecruiters", target: smartrecruiters });
      addTargetToCampaigns(campaignsFilePath, "smartrecruiters", smartrecruiters);
    }

    const talentsoft = await probeTalentsoft(slug, fetchImpl);
    recordProbe(db, slug, "talentsoft", talentsoft);
    if (talentsoft) {
      found.push({ companySlug: slug, platform: "talentsoft", target: talentsoft });
      addTargetToCampaigns(campaignsFilePath, "talentsoft", talentsoft);
    }

    const workday = await probeWorkday(slug, fetchImpl);
    recordProbe(db, slug, "workday", workday);
    if (workday) {
      found.push({ companySlug: slug, platform: "workday", target: workday });
      addTargetToCampaigns(campaignsFilePath, "workday", workday);
    }
  }

  return { probed: toProbe.length, found };
}
