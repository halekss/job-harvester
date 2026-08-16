import type { ContractType } from "../schemas/normalized-offer.js";

export function inferContractTypeFromText(text: string): ContractType {
  if (/apprentissage/i.test(text)) return "apprentissage";
  if (/professionnalisation/i.test(text)) return "professionnalisation";
  return "autre";
}
