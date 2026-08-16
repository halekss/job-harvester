# job-harvester — Sous-projet 3 : connecteurs Workday + SmartRecruiters (Tier 1)

Date : 2026-08-16
Statut : approuvé, prêt pour plan d'implémentation

## Contexte

Suite des sous-projets 1 (`labonnealternance`) et 2 (`francetravail`), tous deux Tier 0
(recherche par code ROME + localisation sur tout le marché). Ce sous-projet correspond au
ticket Linear [JOB-6](https://linear.app/job-harvester/issue/JOB-6), resserré le 2026-08-16
après vérification technique en direct de 5 vendeurs ATS candidats : seuls Workday et
SmartRecruiters se sont confirmés comme de vraies API JSON publiques sans clé, correspondant
au modèle Tier 1 tel que décrit dans le cahier des charges. Les trois autres (Welcome to the
Jungle, Talentsoft, DigitalRecruiters) ont chacun une réalité technique différente de ce que le
cahier des charges supposait et sont traités séparément dans
[JOB-31](https://linear.app/job-harvester/issue/JOB-31).

## Recherche technique effectuée (vérifiée en direct)

- **Workday** : `POST https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
  (liste, body `{appliedFacets:{}, limit, offset, searchText}`), détail par offre à
  `{cxsBase}{externalPath}` où `externalPath` vient de la liste (ex.
  `/job/Nogent-le-Rotrou/Alternant-acheteur_REQ2026071634`). Sans authentification. Testé en
  direct sur `valeo.wd3.myworkdayjobs.com` avec `searchText: "alternance"` — 200 OK, résultats
  réels. Champs de liste : `title`, `externalPath`, `locationsText`, `postedOn` (texte relatif,
  ex. "Posted 30+ Days Ago" — **pas de date absolue**), `bulletFields`. Champs de détail :
  `title`, `jobDescription` (HTML), `location`, `jobReqId`, `jobPostingId`, `externalUrl`.
  URL de candidature publique reconstructible : `https://{tenant}.{dc}.myworkdayjobs.com/{site}{externalPath}`.
  Risque signalé : Akamai peut limiter/bloquer un scraping soutenu depuis une seule IP.
- **SmartRecruiters** : `GET https://api.smartrecruiters.com/v1/companies/{company}/postings`
  (liste), `GET .../postings/{id}` (détail, nécessaire pour la description complète et
  `applyUrl`/`postingUrl`). Sans authentification. Testé en direct sur `MAZARS` (188 offres
  réelles). Champs de liste : `id`, `name`, `releasedDate` (ISO), `location.{city, region,
  country, postalCode, latitude, longitude}`, `department`, `function`, `typeOfEmployment`,
  `company.name`. Champs de détail additionnels : `jobAd.sections.{companyDescription,
  jobDescription}.text` (HTML), `postingUrl`, `applyUrl`. **Aucun filtrage natif par
  code ROME ni par type de contrat "alternance"** côté API. Résiduel non vérifié : le nom exact
  de la clé d'enveloppe de la réponse liste (`content` par convention SmartRecruiters connue,
  non confirmé par un curl direct pendant cette recherche) — à vérifier lors de l'implémentation
  du client (premier appel réel) et corriger le plan si besoin, plutôt qu'à supposer.

## Décisions de cadrage (validées avec l'utilisateur)

1. **Ciblage par entreprise, pas par marché.** Contrairement aux connecteurs Tier 0, Workday et
   SmartRecruiters interrogent une entreprise connue à l'avance (tenant Workday, slug
   SmartRecruiters), pas tout le marché. `CampaignConfigSchema` (et `HarvestQuerySchema`)
   gagnent un champ optionnel `targets` listant les entreprises à interroger par connecteur.
   Valeurs de démonstration pour démarrer, à remplacer par l'utilisateur : Workday `valeo`
   (tenant `valeo`, site `valeo_jobs`, dc `wd3`), SmartRecruiters `MAZARS` — les deux déjà
   vérifiés en direct pendant la recherche.
2. **Connecteurs non géo-scopés.** Ni Workday ni SmartRecruiters ne filtrent par localisation
   dans ce sous-projet. Pour éviter d'interroger inutilement (et redondamment) ces API une fois
   par localisation de campagne — risque concret vu le signal de throttling Akamai — le
   `Connector` commun gagne un champ optionnel `locationScoped?: boolean` (absent ⇒ `true`,
   comportement LBA/FT inchangé). Quand `false`, l'orchestrateur (`runCampaign`) appelle
   `fetch()` une seule fois par run plutôt qu'une fois par localisation de la campagne.
3. **Filtrage alternance côté client pour SmartRecruiters.** L'API ne permettant pas de filtrer
   par type de contrat, le connecteur filtre côté client (titre/description) avant de produire
   ses `RawOffer` — les offres non-alternance ne sont jamais `yield`ées et ne comptent donc pas
   dans `rawCount`. Cohérent avec le fait que le filtrage `codeROME` côté serveur chez LBA/FT
   fait déjà ce travail de narrowing en amont pour ces connecteurs-là.
4. **Pas de date de publication inventée.** Workday n'exposant qu'un texte relatif non fiable
   ("Posted 30+ Days Ago"), `postedAt` reste `undefined` pour ce connecteur plutôt que de
   parser approximativement une date fausse.
5. **Nouveau helper partagé `stripHtml`.** Première source dont la description brute est du
   HTML (Workday et SmartRecruiters le sont tous les deux). Ajouté à `packages/core` comme
   fonction pure réutilisable, pour que `descriptionText` reste du texte brut nettoyé
   conformément au champ minimum du modèle de données.
6. **Sécurité PII inchangée.** Mêmes précautions que sur `francetravail` : schémas Zod
   whitelistés dès l'écriture initiale (pas de champ contact/recruteur inclus), `rawPayload`
   assigné depuis l'objet Zod-parsé, jamais le payload brut.

## Périmètre (fichiers touchés)

- `packages/core/src/schemas/connector.ts` — `targets` sur `HarvestQuerySchema`,
  `locationScoped?` sur `Connector`.
- `packages/core/src/text/strip-html.ts` (nouveau) — `stripHtml(html: string): string`.
- `packages/harvester/src/config/campaign-schema.ts` — `targets` sur `CampaignConfigSchema`.
- `packages/harvester/src/orchestrator.ts` — respect de `locationScoped` dans `runCampaign`.
- `packages/connectors/src/tier1/workday/{types,client,normalize,connector}.ts` + fixtures.
- `packages/connectors/src/tier1/smartrecruiters/{types,client,normalize,connector}.ts` +
  fixtures.
- `docs/sources.md` — entrées Workday et SmartRecruiters.
- `config/campaigns.yaml` — ajout de `targets` d'exemple (Valeo/Mazars) à la campagne
  existante.
- `packages/api/src/server.ts` — enregistrement des deux nouveaux connecteurs.

Non touchés : `packages/db` (aucun changement de schéma), `packages/api/src/routes/harvest.ts`
(la boucle `connector.supports(query)` par localisation fonctionne déjà correctement pour des
connecteurs ciblés par `targets`, puisque `targets` est copié à l'identique sur chaque requête
par localisation — seul le nombre d'appels *fetch* doit changer, pas la logique de sélection),
`packages/web` (hors périmètre).

## Mapping des champs

### Workday → `NormalizedOffer`

| Champ Workday | Champ `NormalizedOffer` |
|---|---|
| `jobReqId` (ou `jobPostingId` si absent) | `sourceOfferId` |
| `title` | `title` |
| `stripHtml(jobDescription)` | `descriptionText` |
| — (pas de date absolue exposée) | `postedAt` reste `undefined` |
| `location` (texte libre, ex. "Nogent-le-Rotrou") | `location.city` (pas de code postal/département disponible) |
| `https://{tenant}.{dc}.myworkdayjobs.com/{site}{externalPath}` | `applyUrl`, puis `canonicalUrl` canonicalisée |
| déduit de titre+description (regex apprentissage/professionnalisation, repli `autre`) | `contractType` |
| — | `originSource` reste `undefined` (offre directe, pas d'agrégateur) |

### SmartRecruiters → `NormalizedOffer`

| Champ SmartRecruiters | Champ `NormalizedOffer` |
|---|---|
| `id` | `sourceOfferId` |
| `name` | `title` |
| `stripHtml(jobAd.sections.jobDescription.text)` | `descriptionText` |
| `releasedDate` | `postedAt` |
| `location.city`/`location.postalCode` | `location.city`/`location.postalCode`, `department` = 2 premiers caractères du code postal si présent |
| `applyUrl` si présent, sinon `postingUrl` | `applyUrl`, puis `canonicalUrl` |
| déduit de nom+description (même regex que Workday) | `contractType` |
| `company.name` | `company.name` |
| — | `originSource` reste `undefined` |

## Tests

- `packages/core` : test de `stripHtml` (retire les balises, préserve le texte, gère les
  entités HTML courantes).
- `workday`/`smartrecruiters` `client.ts` : construction d'URL, enchaînement liste→détail,
  gestion des erreurs HTTP — mêmes patterns déjà établis dans `labonnealternance`/`francetravail`.
- `normalize.ts` : mapping champ par champ contre des fixtures fondées sur les réponses réelles
  capturées pendant la recherche technique ; pour SmartRecruiters, un cas explicite prouvant
  qu'une offre non-alternance est filtrée avant `normalize` (pas seulement rejetée par Zod).
- `orchestrator.ts` : test prouvant qu'un connecteur `locationScoped: false` voit `fetch()`
  appelé exactement une fois pour une campagne à N localisations (N > 1), contre N fois pour un
  connecteur `locationScoped` par défaut/`true`.

## Livrables de ce sous-projet

1. `docs/sources.md` mis à jour avec les entrées Workday et SmartRecruiters.
2. `packages/core` : `targets`/`locationScoped` + `stripHtml`, testés.
3. `packages/harvester` : orchestrateur respectant `locationScoped`, testé.
4. `packages/connectors/src/tier1/{workday,smartrecruiters}/` + fixtures + tests.
5. `config/campaigns.yaml` avec cibles d'exemple.
6. `packages/api/src/server.ts` enregistrant les deux connecteurs.
7. Vérification live : run réel sur Valeo + Mazars, confirmation du non-doublon d'appel par
   localisation, confirmation qu'aucune offre non-alternance SmartRecruiters n'atterrit en
   base.

## Suite

[JOB-31](https://linear.app/job-harvester/issue/JOB-31) (Welcome to the Jungle, Talentsoft,
DigitalRecruiters) reste le prochain chantier logique de la Phase 2, avec trois approches
distinctes à concevoir séparément.
