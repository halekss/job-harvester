// The pages a sitemap crawl lands on carry the same schema.org/JobPosting JSON-LD as
// jsonld-generic's directly-configured target URLs (both go through lib/jsonld.ts), so this
// reuses that mapping instead of duplicating it.
export { normalizeJsonLdOffer } from "../jsonld-generic/normalize.js";
