# Fiabiliser les filtres de collecte (contrat / ville / métier)

## Contexte

Collecte lancée avec `Contrat = Alternance`, `Ville = Lille`, campagne `alternance-data-hdf`.
Résultat observé : offres de Paris, offres hors métier (dev full-stack), offres hors contrat
(stage, CDI, CDD). Le bouton "Lancer la collecte" retourne des offres hors campagne et hors
filtres.

Diagnostic initial établi le 2026-08-24 (voir ticket Linear JOB-61 et ses enfants). Une
exploration approfondie du code réel, menée le même jour avant l'écriture de ce plan, a révélé
que le diagnostic initial sous-estimait le problème sur plusieurs points et qu'au moins deux
"correctifs" envisagés n'étaient en réalité pas nécessaires (le code fait déjà ce qu'il faut).
Ce document fait foi sur l'état réel du code et le périmètre de travail — les tickets Linear ont
été mis à jour en conséquence (JOB-65/68/69 marqués Duplicate de JOB-73, JOB-66 fermé Not-A-Bug,
JOB-74 recentré sur workday+smartrecruiters, JOB-72/73/74 créés).

## Root causes confirmées par lecture directe du code (2026-08-24)

| # | Root cause | Fichier | Statut |
|---|---|---|---|
| A | `inferContractTypeFromText` (déjà appelée par les 4 connecteurs tier1) ne reconnaît pas `"stage"` | `packages/core/src/text/infer-contract-type.ts` | À corriger (JOB-72) |
| B | Aucun filtre après `normalize()` dans `runCampaign()` — aucun connecteur (tier0 ou tier1) ne peut être forcé de respecter `contractTypes`/`keywords`/`location` | `packages/harvester/src/orchestrator.ts` | À corriger (JOB-73) |
| C | Workday cible en dur `searchText: "alternance"` dans sa requête de liste — jamais dérivé de `query.contractTypes` | `packages/connectors/src/tier1/workday/client.ts:48` | À corriger (JOB-74) |
| D | SmartRecruiters pré-filtre côté client avec `isAlternanceRelevant` (regex fixe), jamais dérivé de `query.contractTypes` | `packages/connectors/src/tier1/smartrecruiters/client.ts:19-21` | À corriger (JOB-74) |
| E | France Travail : recherche nationale silencieuse (`console.warn` seul) quand le département ne peut pas être résolu depuis le label | `packages/connectors/src/tier0/francetravail/client.ts:94-113` | À corriger (JOB-64) |
| F | `alternance-data-hdf` et `alternance-devweb-hdf` partagent le ROME générique `M1805` | `config/campaigns.yaml:2,26` | À corriger (JOB-67) |
| G | UI : pas d'option "Stage", pas de "Paris" dans les villes rapides | `packages/web/src/components/HarvestControl.tsx:12-23` | À corriger (JOB-62/63) |

**Confirmées comme NON bugs (fermées) :**
- `labonnealternance/connector.ts` a déjà `supports(query) { return query.contractTypes.some(t => t === "apprentissage" || t === "professionnalisation"); }` — exclusion précoce déjà correcte (JOB-66 fermé).
- `francetravail/connector.ts` a le même garde `supports()` — son filtre interne `listing.alternance !== true` n'est donc jamais atteint hors contexte alternance ; pas une régression à corriger (retiré du périmètre JOB-74).
- `digitalrecruiters`/`talentsoft` n'ont aucun filtre de contrat câblé en dur (contrairement à workday/smartrecruiters) — une fois `contractType` fiable sur l'offre normalisée (JOB-72) et un filtre centralisé en place (JOB-73), ils sont automatiquement couverts sans code spécifique.
- `labonnealternance`/`smartrecruiters`/`talentsoft`/`digitalrecruiters`/`francetravail` respectent déjà nativement `query.location` (LBA/FT via paramètres d'API) ou extraient déjà un `department` en normalize (smartrecruiters/talentsoft/digitalrecruiters via `departmentFromPostalCode`) — seul Workday n'extrait aucun département.

## Décision d'architecture : post-filtre centralisé

Plutôt que dupliquer un filtre par connecteur, un seul point de code dans
`packages/harvester/src/query-filter.ts` (nouveau module) + son intégration dans
`runCampaign()` compare chaque `NormalizedOffer` à la requête effective, pour **tous** les
connecteurs (tier0 et tier1), juste après `normalize()` et avant `upsertOffer`.

**Pourquoi centralisé plutôt que par-connecteur :**
- `contractType` existe déjà sur chaque offre normalisée (via `inferContractTypeFromText` pour
  tier1 ; `mapContractType` pour France Travail — voir limite ci-dessous).
- Un seul point de code colle strictement à la DoD ("aucun connecteur ne peut ignorer
  silencieusement un filtre") sans dupliquer la logique 5+ fois.
- Les pré-filtres existants côté connecteurs tier1 (mots-clés, dupliqués 4x) restent en place
  pour l'efficacité réseau (éviter des appels de détail inutiles) — le filtre centralisé est un
  filet de sécurité final, pas un remplacement.

**Comportement du filtre (`offerMatchesQuery`) :**

1. **Contrat** : si `contractTypes` (dérivés de la requête effective) est non vide, rejeter
   l'offre si `offer.contractType` n'y figure pas.
2. **Mots-clés** : si `keywords` est non vide, rejeter l'offre si titre+description ne matchent
   aucun mot-clé (regex `\b...\b`, insensible à la casse — même logique que les connecteurs
   tier1, dupliquée une 5ᵉ fois ici plutôt qu'extraite en util partagée package-boundary : hors
   scope de ce lot).
3. **Localisation** : dérivé de **toutes** les localisations couvertes par ce run (pas
   uniquement celle de l'itération de boucle courante — voir "Piège identifié" ci-dessous). Si
   au moins un département est dérivable de ces localisations (regex code postal 5 chiffres +
   `departmentFromPostalCode`, déjà exporté par `@job-harvester/core`), rejeter l'offre si
   `offer.location.department` n'est pas dans cet ensemble. **Si aucun département n'est
   dérivable côté requête** (label sans code postal, ex. fixtures de test), aucune contrainte de
   localisation n'est appliquée. **Si un département EST dérivable côté requête mais que
   l'offre n'a pas de `department` résolu** (ex. Workday, dont `normalize.ts` n'extrait
   aujourd'hui aucun département), l'offre est **exclue** (fail-closed) avec un
   `console.warn` explicite identifiant la source — conforme à la DoD ("explicitement exclu
   avec une trace visible"), sans construire de géocodage complet pour Workday (hors scope).

**Piège identifié et corrigé dans la conception** : `runCampaign()` boucle sur
`campaign.locations` (potentiellement plusieurs villes), mais pour un connecteur
`locationScoped: false` (workday/smartrecruiters/talentsoft/digitalrecruiters), un seul
`fetch()` a lieu au total (optimisation réseau existante, JOB-audit antérieur), avec
`query.location` valant arbitrairement la **première** localisation de la liste. Si le filtre
centralisé comparait chaque offre uniquement à `query.location` de l'itération courante, une
campagne à 3 villes [Lille, Amiens, Paris] rejetterait à tort les offres Amiens/Paris de ces
4 connecteurs (elles ne seraient comparées qu'à "Lille"). **Le filtre doit donc être construit
à partir de l'ensemble des départements dérivables de `locations` (toutes les localisations en
jeu pour ce run, calculé une fois avant la boucle), pas de la requête d'une seule itération.**
Cet ensemble se réduit naturellement à un département unique dans le cas d'un filtre ad-hoc
"Ville=Lille" (une seule localisation dans `locations`), ce qui reproduit exactement le
scénario du bug rapporté.

## Limite connue et assumée (France Travail / `mapContractType`)

`francetravail/normalize.ts` dérive `contractType` depuis le champ `natureContrat` de l'API
(pas depuis `inferContractTypeFromText`), via `mapContractType` — qui ne reconnaît que
`apprentissage`/`professionnalisation`/`autre`, jamais `"stage"`. France Travail n'est de toute
façon jamais interrogée pour un filtre Stage seul (`supports()` l'exclut), donc cette limite
n'a pas d'impact observable avec l'UI actuelle (single-select) — non traité dans ce lot,
documenté ici pour éviter une redécouverte future.

## Ce que change chaque ticket

- **JOB-72** (`packages/core`) : `inferContractTypeFromText` reconnaît `"stage"`.
- **JOB-73** (`packages/harvester`) : nouveau `query-filter.ts` + intégration dans
  `runCampaign()`. Couvre automatiquement digitalrecruiters/talentsoft (JOB-65 fermé,
  Duplicate), les mots-clés tier0 (JOB-68 fermé, Duplicate), la localisation pour
  smartrecruiters/talentsoft/digitalrecruiters (JOB-69 fermé, Duplicate).
- **JOB-74** (workday + smartrecruiters uniquement) : recherche/pré-filtre dérivés de
  `query.contractTypes` au lieu d'un mot "alternance" en dur.
- **JOB-64** (`francetravail/client.ts`) : lever une erreur explicite (`throw`, visible dans le
  résumé de collecte comme `✗ échec — ...`) au lieu d'un `console.warn` + repli silencieux sur
  une recherche nationale.
- **JOB-67** (`config/campaigns.yaml`) : retirer `M1805` de `alternance-data-hdf` (déjà
  spécifique via `M1403`) ; `alternance-devweb-hdf` garde `M1805` (ROME générique dev
  légitimement à sa place). Un seul autre couple de campagnes existe aujourd'hui dans le
  fichier — aucune autre ambiguïté à corriger (couvre JOB-71).
- **JOB-62/63** (`HarvestControl.tsx`) : ajout "Stage" à `CONTRACT_OPTIONS`, ajout "Paris" à
  `CITY_LOCATIONS`.
- **JOB-70** : suite d'intégration bout-en-bout sur `runCampaignAcrossConnectors` avec des
  connecteurs simulés tier0+tier1 mélangés, prouvant qu'aucune offre hors filtre ne survit.

## Definition of Done (reprise du ticket parent JOB-61)

- Lancer une collecte avec `Contrat=Alternance, Ville=Lille, campagne=alternance-data-hdf` ne
  retourne que des offres d'alternance, situées à Lille (ou rayon défini), et cohérentes avec le
  métier data.
- Idem pour `Contrat=Stage` et `Ville=Paris` une fois ajoutés.
- Aucun connecteur ne peut ignorer silencieusement un filtre : soit il le respecte, soit il est
  explicitement exclu avec une trace visible pour l'utilisateur/les logs.
