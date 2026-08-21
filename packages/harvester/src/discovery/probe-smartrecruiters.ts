import { USER_AGENT } from "@job-harvester/connectors";

export async function probeSmartRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const company = slug.toUpperCase();
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=1`;
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return undefined;
  return company;
}
