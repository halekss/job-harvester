function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const gramsA = trigrams(a);
  const gramsB = trigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersectionSize += 1;
  }
  const unionSize = gramsA.size + gramsB.size - intersectionSize;
  return intersectionSize / unionSize;
}
