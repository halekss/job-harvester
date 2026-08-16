import { ulid } from "ulid";
import {
  canonicalizeUrl,
  exactDedupKeyFromUrl,
  normalizeCompanyName,
  stripHtml,
  inferContractTypeFromText,
  type NormalizedOffer,
  type RawOffer,
} from "@job-harvester/core";
import { WorkdayRawOfferSchema } from "./types.js";
import { WORKDAY_CONNECTOR_ID } from "./client.js";

export function normalizeWorkdayOffer(raw: RawOffer): NormalizedOffer {
  const parsed = WorkdayRawOfferSchema.parse(raw.payload);
  const { target, externalPath, jobPostingInfo } = parsed;

  const applyUrl =
    jobPostingInfo.externalUrl ?? `https://${target.tenant}.${target.dc}.myworkdayjobs.com/${target.site}${externalPath}`;
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const sourceOfferId = jobPostingInfo.jobReqId ?? externalPath;
  const descriptionText = stripHtml(jobPostingInfo.jobDescription);
  const city = jobPostingInfo.location ?? "";

  return {
    id: ulid(),
    source: WORKDAY_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl,
    title: jobPostingInfo.title,
    company: {
      name: target.tenant,
      normalizedName: normalizeCompanyName(target.tenant),
    },
    location: {
      label: city,
      city,
    },
    contractType: inferContractTypeFromText(`${jobPostingInfo.title} ${descriptionText}`),
    romeCodes: [],
    descriptionText,
    remotePolicy: "unknown",
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: WORKDAY_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: parsed,
  };
}
