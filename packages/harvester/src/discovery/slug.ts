import { normalizeCompanyName } from "@job-harvester/core";

export function companySlug(companyName: string): string {
  return normalizeCompanyName(companyName).replace(/\s+/g, "-");
}
