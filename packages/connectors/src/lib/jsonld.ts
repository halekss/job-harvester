import * as cheerio from "cheerio";

function hasJobPostingType(value: unknown): value is { "@type": string | string[] } {
  if (typeof value !== "object" || value === null || !("@type" in value)) return false;
  const type = (value as { "@type": unknown })["@type"];
  if (typeof type === "string") return type === "JobPosting";
  if (Array.isArray(type)) return type.includes("JobPosting");
  return false;
}

function flatten(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null && "@graph" in parsed) {
    const graph = (parsed as { "@graph": unknown })["@graph"];
    if (Array.isArray(graph)) return graph;
  }
  return [parsed];
}

export function extractJobPostings(html: string): unknown[] {
  const $ = cheerio.load(html);
  const jobPostings: unknown[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const content = $(element).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON in a single <script> block must not stop extraction from the others.
      return;
    }
    for (const item of flatten(parsed)) {
      if (hasJobPostingType(item)) {
        jobPostings.push(item);
      }
    }
  });

  return jobPostings;
}
