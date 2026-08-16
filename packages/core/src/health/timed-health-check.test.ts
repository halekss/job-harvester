import { describe, it, expect } from "vitest";
import { timedHealthCheck } from "./timed-health-check.js";

describe("timedHealthCheck", () => {
  it("reports ok:true from a successful Response probe", async () => {
    const health = await timedHealthCheck("fake", async () => new Response("{}", { status: 200 }));
    expect(health).toMatchObject({ connectorId: "fake", ok: true });
    expect(health.message).toBeUndefined();
  });

  it("reports ok:false with an HTTP message from a non-ok Response probe", async () => {
    const health = await timedHealthCheck("fake", async () => new Response("nope", { status: 500 }));
    expect(health).toMatchObject({ connectorId: "fake", ok: false, message: "HTTP 500" });
  });

  it("reports ok:false with the error message when the probe throws", async () => {
    const health = await timedHealthCheck("fake", async () => {
      throw new Error("network down");
    });
    expect(health).toMatchObject({ connectorId: "fake", ok: false, message: "network down" });
  });

  it("reports ok:true when the probe resolves without returning a Response (JOB-25/JOB-26 pattern)", async () => {
    const health = await timedHealthCheck("fake", async () => "some-token");
    expect(health).toMatchObject({ connectorId: "fake", ok: true });
  });
});
