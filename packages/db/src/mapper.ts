import type { NormalizedOffer } from "@job-harvester/core";
import type { offers } from "./schema.js";

type OfferRow = typeof offers.$inferSelect;
type OfferInsert = typeof offers.$inferInsert;

export function offerToRow(offer: NormalizedOffer): OfferInsert {
  return {
    id: offer.id,
    source: offer.source,
    sourceOfferId: offer.sourceOfferId,
    originSource: offer.originSource ?? null,
    canonicalUrl: offer.canonicalUrl,
    applyUrl: offer.applyUrl ?? null,
    title: offer.title,
    companyName: offer.company.name,
    companyNormalizedName: offer.company.normalizedName,
    companySiret: offer.company.siret ?? null,
    companyWebsite: offer.company.website ?? null,
    locationLabel: offer.location.label,
    city: offer.location.city,
    postalCode: offer.location.postalCode ?? null,
    department: offer.location.department ?? null,
    lat: offer.location.lat ?? null,
    lng: offer.location.lng ?? null,
    contractType: offer.contractType,
    durationMonths: offer.durationMonths ?? null,
    startDate: offer.startDate ?? null,
    romeCodes: offer.romeCodes,
    descriptionText: offer.descriptionText,
    descriptionHtml: offer.descriptionHtml ?? null,
    salary: offer.salary ?? null,
    remotePolicy: offer.remotePolicy ?? null,
    postedAt: offer.postedAt ?? null,
    expiresAt: offer.expiresAt ?? null,
    firstSeenAt: offer.firstSeenAt,
    lastSeenAt: offer.lastSeenAt,
    lifecycle: offer.lifecycle,
    dedupKey: offer.dedupKey,
    sourceRefs: offer.sourceRefs,
    rawPayload: offer.rawPayload,
  };
}

export function rowToOffer(row: OfferRow): NormalizedOffer {
  return {
    id: row.id,
    source: row.source,
    sourceOfferId: row.sourceOfferId,
    originSource: row.originSource ?? undefined,
    canonicalUrl: row.canonicalUrl,
    applyUrl: row.applyUrl ?? undefined,
    title: row.title,
    company: {
      name: row.companyName,
      normalizedName: row.companyNormalizedName,
      siret: row.companySiret ?? undefined,
      website: row.companyWebsite ?? undefined,
    },
    location: {
      label: row.locationLabel,
      city: row.city,
      postalCode: row.postalCode ?? undefined,
      department: row.department ?? undefined,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
    },
    contractType: row.contractType as NormalizedOffer["contractType"],
    durationMonths: row.durationMonths ?? undefined,
    startDate: row.startDate ?? undefined,
    romeCodes: row.romeCodes,
    descriptionText: row.descriptionText,
    descriptionHtml: row.descriptionHtml ?? undefined,
    // Cast: schema's JSON-typed salary.period is a plain `string` (looser than the
    // core "hourly"|"monthly"|"yearly" literal union); values only ever come from offerToRow.
    salary: (row.salary ?? undefined) as NormalizedOffer["salary"],
    remotePolicy: (row.remotePolicy ?? undefined) as NormalizedOffer["remotePolicy"],
    postedAt: row.postedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lifecycle: row.lifecycle as NormalizedOffer["lifecycle"],
    dedupKey: row.dedupKey,
    sourceRefs: row.sourceRefs,
    rawPayload: row.rawPayload,
  };
}
