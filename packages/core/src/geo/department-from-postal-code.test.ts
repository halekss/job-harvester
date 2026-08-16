import { describe, it, expect } from "vitest";
import { departmentFromPostalCode } from "./department-from-postal-code.js";

describe("departmentFromPostalCode", () => {
  it("extracts a 2-digit department for metropolitan postal codes", () => {
    expect(departmentFromPostalCode("59000")).toBe("59");
    expect(departmentFromPostalCode("75001")).toBe("75");
  });

  it("extracts a 3-digit department for DOM postal codes (JOB-27)", () => {
    expect(departmentFromPostalCode("97100")).toBe("971");
    expect(departmentFromPostalCode("97200")).toBe("972");
    expect(departmentFromPostalCode("97300")).toBe("973");
    expect(departmentFromPostalCode("97400")).toBe("974");
    expect(departmentFromPostalCode("97600")).toBe("976");
  });

  it("returns undefined for a postal code that isn't 5 digits", () => {
    expect(departmentFromPostalCode("Lille")).toBeUndefined();
    expect(departmentFromPostalCode("")).toBeUndefined();
  });
});
