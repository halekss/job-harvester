import { describe, it, expect, vi } from "vitest";
import { isAllowedByRobots } from "./robots.js";

const USER_AGENT = "job-harvester/0.1 (personal alternance watch tool; +https://github.com/halekss/job-harvester)";

describe("isAllowedByRobots", () => {
  it("disallows a URL matching a Disallow rule for the given user agent", async () => {
    const robotsTxt = ["User-agent: *", "Disallow: /admin", "Disallow: /private/"].join("\n");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(robotsTxt, { status: 200 }));

    await expect(isAllowedByRobots("https://disallow-example.com/admin/dashboard", USER_AGENT, fetchImpl)).resolves.toBe(false);
    await expect(isAllowedByRobots("https://disallow-example.com/private/page", USER_AGENT, fetchImpl)).resolves.toBe(false);
  });

  it("allows a URL not matching any Disallow rule", async () => {
    const robotsTxt = ["User-agent: *", "Disallow: /admin"].join("\n");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(robotsTxt, { status: 200 }));

    await expect(isAllowedByRobots("https://allow-example.com/careers/job-123", USER_AGENT, fetchImpl)).resolves.toBe(true);
  });

  it("respects an Allow rule that overrides a broader Disallow", async () => {
    const robotsTxt = ["User-agent: *", "Disallow: /jobs", "Allow: /jobs/public"].join("\n");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(robotsTxt, { status: 200 }));

    await expect(isAllowedByRobots("https://override-example.com/jobs/public/123", USER_AGENT, fetchImpl)).resolves.toBe(true);
    await expect(isAllowedByRobots("https://override-example.com/jobs/internal", USER_AGENT, fetchImpl)).resolves.toBe(false);
  });

  it("defaults to allowed when robots.txt is absent (404)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("Not found", { status: 404 }));

    await expect(isAllowedByRobots("https://missing-robots-example.com/careers/job-123", USER_AGENT, fetchImpl)).resolves.toBe(true);
  });

  it("defaults to allowed when robots.txt is empty", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 200 }));

    await expect(isAllowedByRobots("https://empty-robots-example.com/careers/job-123", USER_AGENT, fetchImpl)).resolves.toBe(true);
  });

  it("caches robots.txt per origin and only fetches it once across multiple URL checks", async () => {
    const robotsTxt = ["User-agent: *", "Disallow: /admin"].join("\n");
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(robotsTxt, { status: 200 }));

    await isAllowedByRobots("https://cached-example.com/a", USER_AGENT, fetchImpl);
    await isAllowedByRobots("https://cached-example.com/b", USER_AGENT, fetchImpl);
    await isAllowedByRobots("https://cached-example.com/c", USER_AGENT, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
