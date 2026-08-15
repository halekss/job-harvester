const LEGAL_SUFFIXES = new Set(["sasu", "sas", "sarl", "eurl", "sa", "sci", "scop", "groupe", "group"]);

export function normalizeCompanyName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped
    .split(" ")
    .filter((token) => token.length > 0 && !LEGAL_SUFFIXES.has(token))
    .join(" ");
}
