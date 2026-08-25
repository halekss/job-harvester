# Prompt développeur senior — Fiabiliser les filtres de collecte (contrat / ville / métier)

> Contexte : collecte lancée avec `Contrat = Alternance`, `Ville = Lille`, campagne `alternance-data-hdf`.
> Résultat observé : offres de Paris, offres hors métier (dev full-stack), offres hors contrat
> (stage, CDI, CDD). Le bouton "Lancer la recherche" retourne des offres hors campagne et hors filtres.
> Diagnostic établi le 2026-08-24 par exploration du repo `job-harvester`.

## 1. Contexte pour l'agent/développeur qui reprend ce ticket

Le collecteur (`packages/harvester`) orchestre des connecteurs (`packages/connectors`) pour des
campagnes définies dans `config/campaigns.yaml`, pilotées depuis l'UI `packages/web` et exposées via
`packages/api`. Le problème n'est **pas un bug isolé** : c'est une divergence structurelle entre ce
que l'UI laisse croire (un filtrage strict) et ce que les connecteurs font réellement (filtrage
partiel côté API, filtrage texte approximatif, ou **aucun filtrage**).

Objectif : que chaque recherche lancée soit **fonctionnelle, efficace et pertinente** — un connecteur
qui ne peut pas garantir un filtre (contrat ou ville) doit soit l'appliquer correctement en
post-traitement, soit être exclu de la campagne, jamais laisser passer silencieusement des offres
hors périmètre.

## 2. Root causes identifiées (fichier:ligne)

| # | Root cause | Fichier | Impact |
|---|---|---|---|
| 1 | 4 connecteurs tier1 ont `locationScoped: false` → `query.location` (Lille) jamais utilisé | `packages/connectors/src/tier1/{workday,smartrecruiters,talentsoft,digitalrecruiters}/connector.ts:8` | Offres de Paris/toute ville remontent même avec filtre Ville=Lille |
| 2 | `digitalrecruiters` n'applique **aucun** filtre de type de contrat | `packages/connectors/src/tier1/digitalrecruiters/client.ts:58-86` | CDI/CDD/stage remontent sur une recherche "Alternance" |
| 3 | `alternance-data-hdf` et `alternance-devweb-hdf` partagent le code ROME `M1805` (générique dev) | `config/campaigns.yaml:3` et `:27` | Offres dev full-stack polluent la campagne "data" |
| 4 | `francetravail`: extraction du département dépend d'un code postal dans `location.label`; si absent → recherche nationale silencieuse (juste un `console.warn`) | `packages/connectors/src/tier0/francetravail/client.ts:94-113` | Risque de recherche non bornée géographiquement, sans erreur visible |
| 5 | `labonnealternance`: aucun paramètre ni post-filtre de type de contrat envoyé/vérifié | `packages/connectors/src/tier0/labonnealternance/client.ts` | Dépend entièrement de l'hypothèse "l'API ne renvoie que de l'alternance" — non garanti |
| 6 | `keywords` (champ "Métier" de l'UI) jamais transmis aux connecteurs tier0 (francetravail, labonnealternance) | `packages/harvester/src/build-harvest-query.ts:19`, `tier0/*/client.ts` | Le champ "Métier" est décoratif pour ces deux connecteurs |
| 7 | UI: `CONTRACT_OPTIONS` n'expose pas `"stage"` alors que l'enum central le supporte déjà | `packages/web/src/components/HarvestControl.tsx:12-16` vs `packages/core/src/schemas/normalized-offer.ts:3` | Impossible de tester/filtrer explicitement les stages |
| 8 | UI: `CITY_LOCATIONS` ne contient que Lille/Amiens, pas Paris (alors que Paris existe déjà dans `campaigns.yaml:8`) | `packages/web/src/components/HarvestControl.tsx:20-23` | Impossible de cibler ou d'exclure explicitement Paris en lancement ad-hoc |
| 9 | `CDI` et `CDD` mappent tous deux vers `["autre"]` — aucun connecteur ne les distingue | `packages/web/src/components/HarvestControl.tsx:12-16` | Filtre CDI/CDD non fiable, à documenter au minimum |

## 3. Ce qui doit changer (spécification fonctionnelle)

1. **Contrat de localisation strict pour les connecteurs** : un connecteur `locationScoped: false`
   doit soit (a) recevoir un post-filtre de localisation basé sur les données de l'offre (ville/code
   postal détecté dans l'adresse), soit (b) être marqué explicitement "non fiable pour un filtre
   ville" et exclu automatiquement quand l'utilisateur sélectionne une ville précise — jamais silencieux.
2. **Contrat de type de contrat strict** : chaque connecteur doit soit filtrer réellement côté API,
   soit appliquer un post-filtre texte robuste (comme `workday`/`smartrecruiters`), et ce pour
   **tous** les connecteurs actifs — combler `digitalrecruiters` (root cause #2) et sécuriser
   `labonnealternance` (root cause #5).
3. **Séparation des campagnes par métier réel** : ne plus partager de code ROME générique entre
   campagnes distinctes ; si un ROME est ambigu (ex M1805), affiner via mots-clés obligatoires
   appliqués en post-filtre même sur les connecteurs tier0 (corrige aussi root cause #6).
4. **Transmission effective des mots-clés/métier** à tous les connecteurs, y compris tier0
   (post-filtre minimum si l'API ne le supporte pas nativement).
5. **Ajout "Stage" au filtre Contrat de l'UI** (`HarvestControl.tsx`), mappé sur `["stage"]`, avec
   vérification que chaque connecteur gère ce cas (inclusion ou exclusion propre, pas un flou).
6. **Ajout "Paris" au filtre Ville de l'UI**, en réutilisant les coordonnées déjà présentes dans
   `config/campaigns.yaml:8`.
7. **Garde-fou anti-régression silencieuse** : remplacer le `console.warn` de
   `francetravail/client.ts` (root cause #4) par un comportement explicite (erreur remontée à l'UI,
   ou refus de lancer la recherche) quand la géolocalisation ne peut pas être résolue.
8. **Tests d'intégration** par connecteur : pour un jeu de filtres donné (contrat + ville + métier),
   vérifier que 100% des offres retournées respectent les 3 critères — ces tests doivent être ceux
   qui auraient détecté ce bug avant mise en prod.

## 4. Découpage en tickets Linear (par charge de travail)

> ⚠️ Le connecteur MCP Linear n'est pas encore autorisé dans cette session (auth requise via
> `claude mcp` / `/mcp` en session interactive, ou les réglages du connecteur claude.ai). Les
> tickets ci-dessous sont prêts à être créés dès que l'accès sera rétabli — dites-moi si vous
> voulez que je les crée automatiquement une fois l'auth faite.

### S (petit, < 0.5 jour)
- **[UI] Ajouter "Stage" au filtre Type de contrat** — `HarvestControl.tsx`, mapping `["stage"]`.
- **[UI] Ajouter "Paris" au filtre Ville** — réutiliser les coordonnées de `campaigns.yaml`.
- **[Fix] Remplacer le `console.warn` silencieux de `francetravail/client.ts` par une erreur explicite** quand le département ne peut pas être résolu.

### M (moyen, 0.5–1.5 jour)
- **[Connector] Ajouter un post-filtre de type de contrat sur `digitalrecruiters`** (aligné sur la logique regex de `workday`/`smartrecruiters`).
- **[Connector] Ajouter un post-filtre de type de contrat sur `labonnealternance`** (vérifier le champ retourné par l'API, sinon whitelister explicitement les statuts attendus).
- **[Campaign] Séparer les ROME partagés entre `alternance-data-hdf` et `alternance-devweb-hdf`** + ajouter des mots-clés obligatoires en post-filtre pour désambiguïser M1805.
- **[Harvester] Transmettre `keywords` aux connecteurs tier0** (`francetravail`, `labonnealternance`) avec post-filtre côté client si l'API ne le supporte pas nativement.

### L (grand, 2+ jours)
- **[Architecture] Filtrage de localisation pour les connecteurs `locationScoped: false`** (workday, smartrecruiters, talentsoft, digitalrecruiters) : soit extraction+comparaison de la ville/code postal depuis les données d'offre, soit exclusion automatique et visible de ces connecteurs quand une ville précise est sélectionnée.
- **[QA] Suite de tests d'intégration "filtres respectés à 100%"** par connecteur et par campagne, avec jeux de données fixtures existants (`fixtures/*`), à faire tourner en CI pour empêcher toute régression de ce type.
- **[Audit] Revue complète des campagnes existantes** (`config/campaigns.yaml`) pour vérifier qu'aucune autre paire de campagnes ne partage un ROME ambigu, et documenter la convention à suivre pour en créer de nouvelles.

## 5. Definition of Done pour l'ensemble

- Lancer une collecte avec `Contrat=Alternance, Ville=Lille, campagne=alternance-data-hdf` ne retourne
  que des offres d'alternance, situées à Lille (ou rayon défini), et cohérentes avec le métier data.
- Idem pour `Contrat=Stage` et `Ville=Paris` une fois ajoutés.
- Aucun connecteur ne peut ignorer silencieusement un filtre : soit il le respecte, soit il est
  explicitement exclu avec une trace visible pour l'utilisateur/les logs.
