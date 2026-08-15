import { describe, it, expect } from "vitest";
import { ApplicationEventSchema } from "./application-event.js";

describe("ApplicationEventSchema", () => {
  it("accepts a minimal valid event", () => {
    const event = {
      id: "01J000000000000000000001",
      offerId: "01J000000000000000000000",
      type: "applied",
      occurredAt: "2026-08-15T00:00:00.000Z",
    };
    expect(ApplicationEventSchema.parse(event)).toMatchObject({ type: "applied" });
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      ApplicationEventSchema.parse({
        id: "01J000000000000000000001",
        offerId: "01J000000000000000000000",
        type: "ghosted",
        occurredAt: "2026-08-15T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
