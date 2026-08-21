import robotsParserImport from "robots-parser";

// robots-parser's own index.d.ts starts with a stray `declare module 'robots-parser';` shorthand
// ambient declaration, which makes the default import's inferred type an uncallable module
// namespace instead of the parser function it actually is at runtime (verified: index.js does
// `module.exports = function (url, contents) { ... }`). Re-typing the import through `unknown`
// works around that broken declaration file rather than fighting it.
interface Robots {
  isAllowed(url: string, ua?: string): boolean | undefined;
}
const robotsParser = robotsParserImport as unknown as (url: string, robotsTxt: string) => Robots;

const robotsCache = new Map<string, Robots>();

async function getRobots(origin: string, fetchImpl: typeof fetch): Promise<Robots> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const robotsUrl = `${origin}/robots.txt`;
  let body = "";
  try {
    const response = await fetchImpl(robotsUrl);
    if (response.ok) {
      body = await response.text();
    }
  } catch {
    // Network failure fetching robots.txt: treat as absent (allow by default), same as a 404.
  }

  const robots = robotsParser(robotsUrl, body);
  robotsCache.set(origin, robots);
  return robots;
}

export async function isAllowedByRobots(url: string, userAgent: string, fetchImpl: typeof fetch): Promise<boolean> {
  const origin = new URL(url).origin;
  const robots = await getRobots(origin, fetchImpl);
  return robots.isAllowed(url, userAgent) ?? true;
}
