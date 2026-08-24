import type { ContractType } from "../schemas/normalized-offer.js";

export function inferContractTypeFromText(text: string): ContractType {
  if (/apprentissage/i.test(text)) return "apprentissage";
  if (/professionnalisation/i.test(text)) return "professionnalisation";
  // "alternance"/"alternant" is the generic French term covering both contract types below —
  // it doesn't itself specify which. Default to apprentissage (the more common of the two)
  // rather than losing the offer to "autre", which a strict-equality UI filter would exclude
  // entirely (JOB-33). Revisit if a source distinguishes the two more precisely.
  if (/alternan(t|ce)/i.test(text)) return "apprentissage";
  if (/\bstages?\b|stagiaire/i.test(text)) return "stage";
  return "autre";
}
