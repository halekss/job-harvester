// packages/harvester/src/scheduler.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "@job-harvester/db";
import type { Connector } from "@job-harvester/core";
import { startScheduler } from "./scheduler.js";
import type { CampaignConfig } from "./config/campaign-schema.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-scheduler-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function makeConnector(callLog: string[]): Connector {
  return {
    id: "fake",
    tier: 0,
    supports: () => true,
    async *fetch() {
      callLog.push("fetched");
    },
    normalize: (raw) => raw.payload as never,
    async healthCheck() {
      return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
    },
  };
}

// Unlike a thrown `fetch` (which runCampaign catches internally and reports as a failed
// RunSummary, see orchestrator.test.ts "records a failed run when connector.fetch throws,
// without rethrowing"), a throwing `supports()` blows up synchronously inside
// runCampaignAcrossConnectors's outer filter, outside any try/catch — so it genuinely rejects
// the promise returned to the scheduler's tick callback. That's the real trigger for JOB-5's
// "unhandled rejection crashes the process" bug.
function makeThrowingConnector(): Connector {
  return {
    id: "throwing",
    tier: 0,
    supports: () => {
      throw new Error("boom from supports()");
    },
    async *fetch() {},
    normalize: (raw) => raw.payload as never,
    async healthCheck() {
      return { connectorId: "throwing", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("startScheduler", () => {
  it("runs a campaign's harvest on its cron schedule", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "every-second",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *", // every second (6-field croner pattern)
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    await wait(1300);
    scheduler.stop();

    expect(callLog.length).toBeGreaterThanOrEqual(1);
  });

  it("does not schedule anything for a campaign without a schedule field", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "no-schedule",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    await wait(1300);
    scheduler.stop();

    expect(callLog).toEqual([]);
  });

  it("stop() prevents any further scheduled runs", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "stopped-immediately",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *",
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    scheduler.stop();
    await wait(1300);

    expect(callLog).toEqual([]);
  });

  it("routes a rejected campaign run to the catch handler instead of crashing", async () => {
    const db = createDb(tmpDbPath());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const campaign: CampaignConfig = {
      id: "throwing-campaign",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *",
    };

    const scheduler = startScheduler([campaign], [makeThrowingConnector()], db, {});
    await wait(1300);
    scheduler.stop();

    // If the tick callback discards the rejected promise (e.g. via `void`), croner's `catch`
    // option never fires and the rejection becomes an unhandled rejection outside vitest's
    // control — reaching this assertion at all (without the test process crashing/erroring
    // on an unhandled rejection) is itself part of the regression guard.
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[1]).toBeInstanceOf(Error);

    errorSpy.mockRestore();
  });

  it("skips a campaign with an invalid schedule string without throwing, and still runs the other valid campaigns (JOB-5)", async () => {
    const db = createDb(tmpDbPath());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const callLog: string[] = [];

    const invalidCampaign: CampaignConfig = {
      id: "invalid-schedule",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "not a valid cron",
    };
    const validCampaign: CampaignConfig = {
      id: "valid-schedule",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *",
    };

    let scheduler: ReturnType<typeof startScheduler> | undefined;
    expect(() => {
      scheduler = startScheduler([invalidCampaign, validCampaign], [makeConnector(callLog)], db, {});
    }).not.toThrow();

    await wait(1300);
    scheduler?.stop();

    expect(callLog.length).toBeGreaterThanOrEqual(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid-schedule"),
      expect.anything(),
    );

    errorSpy.mockRestore();
  });
});
