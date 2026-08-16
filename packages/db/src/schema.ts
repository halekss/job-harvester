import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const offers = sqliteTable("offers", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceOfferId: text("source_offer_id").notNull(),
  originSource: text("origin_source"),
  canonicalUrl: text("canonical_url").notNull(),
  applyUrl: text("apply_url"),
  title: text("title").notNull(),
  companyName: text("company_name").notNull(),
  companyNormalizedName: text("company_normalized_name").notNull(),
  companySiret: text("company_siret"),
  companyWebsite: text("company_website"),
  locationLabel: text("location_label").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code"),
  department: text("department"),
  lat: real("lat"),
  lng: real("lng"),
  contractType: text("contract_type").notNull(),
  durationMonths: integer("duration_months"),
  startDate: text("start_date"),
  romeCodes: text("rome_codes", { mode: "json" }).notNull().$type<string[]>(),
  descriptionText: text("description_text").notNull(),
  descriptionHtml: text("description_html"),
  salary: text("salary", { mode: "json" }).$type<{ min?: number; max?: number; period?: string; currency?: string }>(),
  remotePolicy: text("remote_policy"),
  postedAt: text("posted_at"),
  expiresAt: text("expires_at"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  lifecycle: text("lifecycle").notNull(),
  dedupKey: text("dedup_key").notNull(),
  sourceRefs: text("source_refs", { mode: "json" })
    .notNull()
    .$type<Array<{ source: string; sourceOfferId: string; canonicalUrl: string }>>(),
  rawPayload: text("raw_payload", { mode: "json" }).notNull(),
});

export const applicationEvents = sqliteTable("application_events", {
  id: text("id").primaryKey(),
  offerId: text("offer_id")
    .notNull()
    .references(() => offers.id),
  type: text("type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  channel: text("channel"),
  notes: text("notes"),
  nextFollowUpAt: text("next_follow_up_at"),
});

export const connectorRuns = sqliteTable("connector_runs", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  rawCount: integer("raw_count").notNull(),
  normalizedCount: integer("normalized_count").notNull(),
  rejectedCount: integer("rejected_count").notNull(),
  httpStatusesSeen: text("http_statuses_seen", { mode: "json" }).notNull().$type<number[]>(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  errorMessage: text("error_message"),
});
