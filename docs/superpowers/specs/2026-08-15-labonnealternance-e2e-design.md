# job-harvester — Sous-projet 1 : socle + connecteur `labonnealternance` de bout en bout

Date : 2026-08-15
Statut : approuvé, prêt pour plan d'implémentation

## Contexte

`job-harvester` est un outil personnel en deux moitiés : un collecteur d'offres d'alternance
multi-sources (data / dev web, Hauts-de-France + Paris) et un jobboard local de suivi de
candidatures. Le projet est greenfield (dépôt vide). La spec produit complète (fournie par
l'utilisateur) couvre 7 phases et une intégration Linear pour le backlog/alerting — un
périmètre correspondant à plusieurs sous-systèmes indépendants (moteur de dédup, connecteurs
multi-tiers, orchestrateur, DB, API, jobboard React, intégration Linear).

Conformément à la règle « ne pas paralléliser les phases » de la spec produit, et à la
consigne explicite : *« Le connecteur `labonnealternance` seul doit produire un flux
exploitable de bout en bout (collecte, normalisation, dédup, base, affichage) avant qu'un
second connecteur soit écrit »*, ce document ne couvre que ce premier sous-projet. Les
sous-projets suivants (France Travail + connecteurs Tier 1/Tier 2, observabilité + Linear,
jobboard complet Phase 7, orchestrateur complet Phase 3) seront brainstormés et spécifiés
séparément une fois ce flux validé.

## Décisions de cadrage (validées avec l'utilisateur)

- **Identifiants API LBA** : l'utilisateur va s'inscrire pour obtenir un accès API réel avant
  le développement (pas de fixtures-only en fallback pour ce sous-projet). Le connecteur est
  développé et testé hors-ligne contre des fixtures enregistrées, puis validé en live dès que
  les identifiants sont disponibles.
- **Portée UI v1** : liste minimale, non virtualisée, avec filtres basiques et les boutons
  d'événements. Pas de mise à jour optimiste/rollback, pas d'actions groupées, pas de
  persistance des filtres dans l'URL, pas de test a11y automatisé — reportés à un sous-projet
  jobboard dédié (Phase 7 complète).
- **Portée orchestrateur v1** : déclenchement manuel uniquement (`POST
  /harvest/:campaignId/run`), rate-limit basique par domaine (compteur + délai fixe), retry
  simple. Token bucket configurable, backoff exponentiel avec jitter, reprise sur incident,
  planification cron — reportés à un sous-projet orchestration dédié (Phase 3 complète, arrive
  avec le 2e connecteur).
- **Stack** : Hono pour l'API locale (choix libre laissé par la spec produit, préféré à
  Fastify pour son caractère TS-first et léger), Vitest pour les tests, `fetch` natif Node 22
  pour les appels HTTP du connecteur, `yaml` + Zod pour la config de campagne.

## Périmètre (packages livrés)

- `packages/core` — types, schémas Zod, canonicalisation URL, moteur de dédup (exact + flou),
  fusion d'enregistrements
- `packages/connectors/tier0/labonnealternance` — unique connecteur livré dans ce sous-projet
- `packages/harvester` — orchestrateur v1 simplifié (une campagne, un connecteur)
- `packages/db` — schéma Drizzle + migrations SQLite, export/réimport JSON des
  `ApplicationEvent`
- `packages/api` — sous-ensemble Hono des routes Phase 6 utiles à ce flux
- `packages/web` — jobboard minimal (liste + événements)

Hors périmètre : `francetravail` et tous les connecteurs Tier 1/Tier 2, alerting Linear
(Phase 5), planification cron, jobboard complet (Phase 7), robots.txt/CGU enforcement pour
Tier 2 (aucun connecteur Tier 2 dans ce sous-projet).

## Modèle de données

### `NormalizedOffer` (Zod, `packages/core`)

Champs conformes à la spec produit : `id` (ULID), `source`, `sourceOfferId`, `originSource?`,
`canonicalUrl`, `applyUrl?`, `title`, `company` (`name`, `normalizedName`, `siret?`,
`website?`), `location` (`label`, `city`, `postalCode`, `department`, `lat`, `lng`),
`contractType` (`apprentissage | professionnalisation | stage | autre`), `durationMonths?`,
`startDate?`, `romeCodes[]`, `descriptionText`, `descriptionHtml?`, `salary?` (`min`, `max`,
`period`, `currency`), `remotePolicy?` (`onsite | hybrid | remote | unknown`), `postedAt?`,
`expiresAt?`, `firstSeenAt`, `lastSeenAt`, `lifecycle` (`active | expired | dead_link`),
`dedupKey`, `rawPayload` (JSON intégral).

### `ApplicationEvent` (Zod, `packages/core`)

`offerId`, `type` (`applied | spontaneous | followup | interview | rejected | no_reply |
archived`), `occurredAt`, `channel`, `notes`, `nextFollowUpAt`. Append-only : un événement ne
remplace jamais le précédent ; l'état courant d'une offre est dérivé du dernier événement en
base (dérivation calculée à la lecture, jamais stockée comme champ mutable séparé).

### Canonicalisation d'URL

`canonicalizeUrl(url: string): string` — retire `utm_*`, `from`, `source`, `ref`, `gh_src`,
`sid`, trie les paramètres restants par nom, retire le slash final, met le host en
minuscules. Test de non-régression obligatoire : les deux URLs de l'échantillon référençant
l'offre `6a5a004c8bfdaae34d6a2ea4` doivent produire la même chaîne canonique.

### Dédup en deux étages

1. **Exact** : `dedupKey` = hash de `canonicalUrl` OU hash de `(source, sourceOfferId)`.
2. **Flou** : normalisation de raison sociale (suffixes juridiques `SAS`/`SARL`/`SA`/`Groupe`,
   casse, accents) + similarité trigramme/Jaccard (seuil configurable, valeur par défaut à
   documenter dans le code) sur `(normalizedCompanyName, normalizedTitle, city)`.

La dédup est un module pur de `packages/core`, appelé par l'orchestrateur — jamais par un
connecteur, conformément à l'interface `Connector` qui ne connaît ni la DB ni la dédup.

### Fusion

Lors d'une fusion, on conserve toutes les `sourceRefs`, le `firstSeenAt` le plus ancien, la
`descriptionText` la plus longue, et l'`applyUrl` le plus direct (site entreprise préféré à un
lien d'agrégateur).

## Connecteur `labonnealternance`

Implémente l'interface `Connector` commune :

```ts
interface Connector {
  id: string;
  tier: 0 | 1 | 2;
  supports(query: HarvestQuery): boolean;
  fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer>;
  normalize(raw: RawOffer): NormalizedOffer;
  healthCheck(): Promise<ConnectorHealth>;
}
```

- `fetch` : pagination paresseuse contre l'API de recherche LBA (paramètres ROME +
  lat/lng/radius), `AsyncIterable`, jamais un tableau complet en mémoire.
- `normalize` : fonction pure, testée hors-ligne contre fixture enregistrée dans
  `fixtures/labonnealternance/`. Au moins un cas de fixture doit couvrir le rebond vers un
  `originSource` distinct (ex. offre LBA provenant de HelloWork).
- `healthCheck` : requête légère contre l'endpoint, renvoie statut + latence ; permet de
  distinguer une panne réseau d'une réponse 200 à zéro résultat (le comptage zéro-résultat est
  enregistré dans le run, l'alerting proprement dit étant Phase 5, hors périmètre ici).

`docs/sources.md` doit documenter, avant l'écriture du connecteur : la route de recherche
LBA, le format d'authentification par token, les paramètres géographiques, le filtrage par
code ROME, et sous quel champ la source d'origine (agrégateur vs. source réelle) est exposée
dans la réponse.

## Orchestrateur v1 (`packages/harvester`)

- Charge et valide (Zod) un fichier `campaigns.yaml` conforme au format de la spec produit ;
  pour ce sous-projet, une seule campagne avec un seul connecteur supporté
  (`labonnealternance`).
- Fan-out mots-clés × localisations pour cette campagne.
- Rate-limit basique par domaine : compteur de requêtes + délai fixe entre appels (pas de
  token bucket configurable, pas de backoff exponentiel avec jitter — reportés).
- Pour chaque `RawOffer` reçu : normalisation, dédup (exact puis floue) contre l'état actuel
  de la base, puis upsert (insert ou fusion).
- Enregistre un run dans `connector_runs` : offres brutes, offres après normalisation, rejets
  Zod, durée, codes HTTP rencontrés. Consommé par `GET /connectors/health` ; pas de
  déclenchement d'alerte Linear à ce stade (Phase 5).
- Déclenchement exclusivement manuel via `POST /harvest/:campaignId/run`, exécuté en
  synchrone côté API (pas de file de tâches).

## `packages/db`

- Schéma Drizzle : `offers`, `application_events`, `connector_runs`, `campaigns`.
- Migrations SQLite via `drizzle-kit`.
- Export/réimport JSON des `ApplicationEvent` (scripts `pnpm db:export-events` / `pnpm
  db:import-events`), garanti dès ce sous-projet car c'est une contrainte non négociable de la
  spec produit (la base doit être reconstruisible par une collecte complète sans perte des
  événements).

## `packages/api` (Hono)

- `GET /offers` — filtres `city`, `contractType`, `status`, `q`, `postedAfter` ; pagination
  par curseur ; tri `postedAt` puis `firstSeenAt` décroissants.
- `GET /offers/:id`
- `POST /offers/:id/events` — crée un `ApplicationEvent`, ne modifie jamais un champ en place.
- `POST /harvest/:campaignId/run` — déclenche l'orchestrateur v1 en synchrone.
- `GET /connectors/health` — dernier run connu + statut dérivé.

Routes hors périmètre de ce sous-projet : `DELETE /offers/:id/events/:eventId`, `GET /stats`
(reportées, non nécessaires pour valider le flux de bout en bout).

## `packages/web`

- Vite + React 19 + TypeScript + Tailwind CSS v4 (tokens via `@theme` dans `index.css`, pas de
  `tailwind.config` séparé). Thème sombre unique.
- Table HTML simple (non virtualisée) listant les offres : titre, entreprise, ville, source
  (avec distinction source réelle / agrégateur si `originSource` présent), date de
  publication, statut courant.
- Boutons d'événements pour tous les types de la Phase 7 (`Candidature`, `Spontanée`,
  `Relance`, `Entretien`, `Refus`, `Sans réponse`), chaque clic crée un `ApplicationEvent` via
  `POST /offers/:id/events`.
- TanStack Query pour le fetch et l'invalidation après création d'événement (pas de mise à
  jour optimiste avec rollback dans ce sous-projet — refetch simple après succès).

## Erreurs & robustesse

- Tout payload réseau (réponse LBA) passe par Zod avant d'entrer dans le domaine ; un item qui
  échoue la validation est compté comme rejet dans le run et ignoré — il ne fait jamais
  échouer le run entier.
- Le connecteur ne connaît ni la DB ni la dédup (respect strict de l'interface `Connector`).
- Aucun secret en dur : token API LBA via variable d'environnement, `.env.example` documenté
  (le champ `LINEAR_API_KEY`/`LINEAR_TEAM_ID` sera ajouté au `.env.example` lors du sous-projet
  Linear, pas dans celui-ci).
- Aucune donnée personnelle de recruteur (nom, email direct, téléphone) stockée, même présente
  dans le payload source — filtrée à la normalisation.

## Tests

- `core` : canonicalisation d'URL (cas des deux URLs identiques de l'échantillon), dédup exact
  et flou, fusion de doublons.
- `connectors/tier0/labonnealternance` : `normalize` contre fixture(s) enregistrée(s),
  entièrement hors-ligne.
- `db` : migrations applicables proprement, export/import JSON des `ApplicationEvent`
  round-trip sans perte.
- `api` : tests d'intégration sur SQLite fichier temporaire (ou en mémoire).
- `pnpm test` et `pnpm typecheck` (récursifs sur le monorepo) doivent passer avant tout commit.

## Livrables de ce sous-projet

1. `docs/sources.md` initialisé avec l'entrée LBA complète (endpoint, auth, statut
   robots.txt/CGU non applicable — API officielle).
2. `packages/core` avec tests couvrant en particulier le cas des deux URLs identiques.
3. `packages/connectors/tier0/labonnealternance` + fixture(s) + test de normalisation.
4. `packages/harvester` v1 (déclenchement manuel, une campagne, rate-limit basique,
   journalisation de run).
5. `packages/db` avec schéma Drizzle, migrations, export/import JSON.
6. `packages/api` avec les 5 routes listées ci-dessus.
7. `packages/web` avec la liste minimale et les boutons d'événements fonctionnels.
8. `README.md` racine : comment lancer la campagne v1, ajouter une source (pointeur vers la
   structure du connecteur), interpréter `GET /connectors/health`.

## Suite

Une fois ce flux validé de bout en bout (offre visible dans le jobboard, événement
enregistré, run consultable via `/connectors/health`), les sous-projets suivants seront
brainstormés séparément, dans cet ordre suggéré : (a) `francetravail` + généralisation
orchestrateur (Phase 3 complète), (b) connecteurs Tier 1 (`workday`, `smartrecruiters`,
`welcomekit`, `talentsoft`), (c) connecteurs Tier 2 (`jsonld-generic`, `sitemap-crawler`) +
respect `robots.txt`, (d) observabilité + intégration Linear (Phase 5), (e) jobboard complet
(Phase 7 : virtualisation, actions groupées, URL state, a11y testée).
