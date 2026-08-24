import { describe, it, expect } from "vitest";
import { inferContractTypeFromText } from "./infer-contract-type.js";

describe("inferContractTypeFromText", () => {
  it("detects apprentissage", () => {
    expect(inferContractTypeFromText("Alternant en contrat d'apprentissage")).toBe("apprentissage");
  });

  it("detects professionnalisation", () => {
    expect(inferContractTypeFromText("Contrat de professionnalisation proposé")).toBe("professionnalisation");
  });

  it("falls back to autre when neither matches", () => {
    expect(inferContractTypeFromText("Poste en CDI, non concerné")).toBe("autre");
  });

  it("maps the generic word alternance/alternant to apprentissage (JOB-33)", () => {
    expect(inferContractTypeFromText("Alternant Data Analyst")).toBe("apprentissage");
    expect(inferContractTypeFromText("Poste en alternance de 12 mois")).toBe("apprentissage");
  });

  it("detects stage", () => {
    expect(inferContractTypeFromText("Stage Data Analyst 6 mois")).toBe("stage");
    expect(inferContractTypeFromText("Stagiaire marketing H/F")).toBe("stage");
  });

  it("prefers apprentissage/professionnalisation over stage when both appear (unlikely but explicit)", () => {
    expect(inferContractTypeFromText("Contrat d'apprentissage, non un stage")).toBe("apprentissage");
  });
});
