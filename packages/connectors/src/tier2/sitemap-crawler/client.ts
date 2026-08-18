import { timedHealthCheck, type ConnectorHealth, type HarvestQuery } from "@job-harvester/core";
import { isAllowedByRobots } from "../../lib/robots.js";
import { extractJobPostings } from "../../lib/jsonld.js";
import { fetchRenderedHtml } from "../../lib/headless.js";
import { waitForDomain } from "../../lib/domain-politeness.js";
import { USER_AGENT } from "../../lib/user-agent.js";

export const SITEMAP_CRAWLER_CONNECTOR_ID = "sitemap-crawler";

export interface SitemapCrawlerClientOptions {
  fetchImpl?: typeof fetch;
}

function headers(): Record<string, string> {
  return { "User-Agent": USER_AGENT };
}

function resolveSitemapUrl(entry: string): string {
  return entry.toLowerCase().endsWith(".xml") ? entry : `${entry.replace(/\/$/, "")}/sitemap.xml`;
}

const RELEVANT_PATH_PATTERN = /\/jobs\/|\/careers\/|\/offre|\/recrutement/i;

function extractLocs(sitemapXml: string): string[] {
  return Array.from(sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi), (match) => match[1]!);
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`sitemap-crawler fetch failed: HTTP ${response.status}`);
  }
  return response.text();
}

export async function* fetchSitemapCrawlerOffers(
  query: HarvestQuery,
  options: SitemapCrawlerClientOptions,
): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const entries = query.targets?.sitemapCrawler ?? [];

  for (const entry of entries) {
    const sitemapUrl = resolveSitemapUrl(entry);

    const sitemapAllowed = await isAllowedByRobots(sitemapUrl, USER_AGENT, fetchImpl);
    if (!sitemapAllowed) {
      console.warn(`sitemap-crawler: skipping ${sitemapUrl} — disallowed by robots.txt`);
      continue;
    }

    let sitemapXml: string;
    try {
      sitemapXml = await fetchText(sitemapUrl, fetchImpl);
    } catch (error) {
      console.warn(`sitemap-crawler: skipping ${sitemapUrl} — ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const candidateUrls = extractLocs(sitemapXml).filter((url) => RELEVANT_PATH_PATTERN.test(url));

    for (const pageUrl of candidateUrls) {
      const pageAllowed = await isAllowedByRobots(pageUrl, USER_AGENT, fetchImpl);
      if (!pageAllowed) {
        console.warn(`sitemap-crawler: skipping ${pageUrl} — disallowed by robots.txt`);
        continue;
      }

      await waitForDomain(pageUrl);

      let html: string;
      try {
        html = await fetchText(pageUrl, fetchImpl);
      } catch (error) {
        console.warn(`sitemap-crawler: skipping ${pageUrl} — ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      let jobPostings = extractJobPostings(html);
      if (jobPostings.length === 0) {
        // Last resort: some career pages only render their JSON-LD client-side via JS.
        const rendered = await fetchRenderedHtml(pageUrl);
        jobPostings = extractJobPostings(rendered);
      }
      if (jobPostings.length === 0) continue;

      for (const jobPosting of jobPostings) {
        yield { pageUrl, jobPosting };
      }
    }
  }
}

export async function checkSitemapCrawlerHealth(options: SitemapCrawlerClientOptions): Promise<ConnectorHealth> {
  // No single fixed domain to probe — target sitemaps are configured per campaign, not per
  // connector — so this only confirms the connector is wired up, not a specific remote endpoint.
  void options;
  return timedHealthCheck(SITEMAP_CRAWLER_CONNECTOR_ID, async () => true);
}
