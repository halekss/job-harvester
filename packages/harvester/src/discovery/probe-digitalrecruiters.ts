import { USER_AGENT } from "@job-harvester/connectors";

export async function probeDigitalRecruiters(slug: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const domain = `joinus.${slug}.fr`;
  const url = `https://api.digitalrecruiters.com/public/v1/careers-site/job-ads?domainName=${encodeURIComponent(domain)}&limit=1&page=1&locale=fr_FR`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: {}, coordinates: { lat: 0, lng: 0 } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return undefined;
  const body = (await response.json()) as { count?: unknown };
  if (typeof body.count !== "number") return undefined;
  return domain;
}
