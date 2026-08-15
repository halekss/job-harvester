import { createHash } from "node:crypto";

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function exactDedupKeyFromUrl(canonicalUrl: string): string {
  return `url:${sha1(canonicalUrl)}`;
}

export function exactDedupKeyFromSource(source: string, sourceOfferId: string): string {
  return `src:${sha1(`${source}::${sourceOfferId}`)}`;
}
