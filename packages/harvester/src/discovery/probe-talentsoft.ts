import { isAllowedByRobots, USER_AGENT } from "@job-harvester/connectors";

function candidateDomains(slug: string): string[] {
  return [
    `recrutement.${slug}.fr`,
    `${slug}-recrute.talent-soft.com`,
    `${slug}-career.talent-soft.com`,
    `${slug}-cand.talent-soft.com`,
    `${slug}.talent-soft.com`,
  ];
}

function looksLikeTalentsoft(html: string): boolean {
  return /__VIEWSTATE|talentsoft/i.test(html);
}

export async function probeTalentsoft(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  for (const domain of candidateDomains(slug)) {
    const rootUrl = `https://${domain}/`;
    const allowed = await isAllowedByRobots(rootUrl, USER_AGENT, fetchImpl);
    if (!allowed) continue;
    try {
      const response = await fetchImpl(rootUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const html = await response.text();
      if (looksLikeTalentsoft(html)) return domain;
    } catch {
      continue;
    }
  }
  return undefined;
}
