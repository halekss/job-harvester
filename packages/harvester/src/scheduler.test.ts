// packages/harvester/src/scheduler.test.ts
import { describe, it, expect, afterEach } from "vitest";
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
});
