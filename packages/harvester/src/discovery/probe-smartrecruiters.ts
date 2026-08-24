import { USER_AGENT } from "@job-harvester/connectors";

export async function probeSmartRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const company = slug.toUpperCase();
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=1`;
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { totalFound?: unknown };
  if (typeof body.totalFound !== "number" || body.totalFound === 0) return undefined;
  return company;
}
