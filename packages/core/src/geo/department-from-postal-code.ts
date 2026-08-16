// JOB-27 : les DOM (Guadeloupe 971, Martinique 972, Guyane 973, Réunion 974, Mayotte 976) et les
// COM dont le code postal suit la même convention à 3 chiffres (975 Saint-Pierre-et-Miquelon,
// 977/978 Saint-Barthélemy/Saint-Martin, 984/986/987/988 pour les TOM du Pacifique) ont un
// département à 3 chiffres, pas 2 — une troncature aveugle à 2 caractères produit un code
// department faux ("97" au lieu de "971", etc.).
//
// La Corse (codes postaux 20xxx) reste un cas non résolu ici : les départements réels sont 2A
// (Corse-du-Sud) et 2B (Haute-Corse), une distinction qui dépend de la commune (code INSEE),
// pas du code postal seul — un même préfixe 20xxx existe des deux côtés. Retourne "20" plutôt
// que de deviner 2A/2B sans base fiable.
const THREE_DIGIT_DEPARTMENT_PREFIXES = /^(97[1-8]|98[4678])/;

export function departmentFromPostalCode(postalCode: string): string | undefined {
  if (!/^\d{5}$/.test(postalCode)) return undefined;
  if (THREE_DIGIT_DEPARTMENT_PREFIXES.test(postalCode)) return postalCode.slice(0, 3);
  return postalCode.slice(0, 2);
}
