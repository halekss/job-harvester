const ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

export function stripHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, " ");
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}
