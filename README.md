# job-harvester

Outil personnel de veille et de suivi de candidatures en alternance. Collecte des offres
via des connecteurs multi-sources et les affiche dans un jobboard local de suivi.

## Démarrer

```bash
pnpm install
cp .env.example .env   # renseigner LBA_API_KEY
pnpm --filter @job-harvester/db exec drizzle-kit generate   # si les migrations ne sont pas déjà commitées
pnpm dev:api            # démarre l'API locale sur http://localhost:3000
pnpm dev:web             # démarre le jobboard sur http://localhost:5173 (proxy vers l'API)
```

## Lancer une campagne de collecte

Les campagnes sont déclarées dans `config/campaigns.yaml`. Pour lancer la campagne
`alternance-data-hdf` une fois l'API démarrée :

```bash
curl -X POST http://localhost:3000/harvest/alternance-data-hdf/run
```

La réponse a la forme `{ summaries: [...], discoveries: { probed, found } }` : `summaries` est
un résumé (`rawCount`, `normalizedCount`, `rejectedCount`) par connecteur supportant la
campagne, et `discoveries` rend compte de la découverte de nouvelles cibles (voir plus bas).
Les offres apparaissent ensuite dans le jobboard (`pnpm dev:web`).

## Filtre de campagne centralisé

Après `normalize()`, chaque offre — quel que soit le connecteur (tier0 ou tier1, qu'il applique
ou non son propre pré-filtre) — est vérifiée par rapport au `contractTypes`/`keywords`/aux
localisations effectifs de la campagne avant d'être persistée. Un connecteur qui ne filtre pas
lui-même (ou filtre mal) ne peut donc plus laisser passer d'offres hors périmètre : le rejet
correspondant est comptabilisé dans `rejectedCount` (voir ci-dessus et section `GET
/connectors/health`).

Le filtre de localisation compare l'offre à chaque localisation de la campagne selon une cascade
à 3 niveaux, du plus fiable au plus grossier (`resolveLocationVerdict()` dans
`packages/harvester/src/query-filter.ts`) :

1. **Rayon géographique** (distance orthodromique) si l'offre porte ses propres coordonnées
   (`labonnealternance`, `welcometothejungle`) — comparé au `radiusKm` de la localisation, pas à
   l'égalité stricte de département : une offre à 20 km de Lille dans le département voisin (62)
   reste acceptée.
2. **Égalité de département** si l'offre n'a pas de coordonnées mais un département résolu
   (`francetravail`, `smartrecruiters`, `talentsoft`, `digitalrecruiters`, `jsonld-generic`).
3. **Nom de ville normalisé** (accents/casse) contre les libellés des localisations de la
   campagne, en dernier recours — nécessaire pour `workday`, qui n'expose ni coordonnées ni code
   postal, seulement un nom de ville libre.

Si aucun des trois niveaux ne permet de trancher (aucune information de localisation exploitable
sur l'offre), elle est exclue plutôt qu'acceptée par défaut (fail-closed), avec un `console.warn`
pour le signaler — ce cas est compté séparément dans `unresolvedLocationCount` (sous-ensemble de
`rejectedCount`, exposé dans les résumés de run).

## Planifier des collectes automatiques (cron)

Chaque campagne de `config/campaigns.yaml` peut définir un champ `schedule` (expression cron,
ex. `"0 7 * * *"` pour 7h chaque jour). Le serveur API exécute alors automatiquement la collecte
de cette campagne à l'horaire indiqué (en interne, sans passer par la route HTTP ci-dessus) —
mais seulement si la variable d'environnement `ENABLE_SCHEDULER=true` est définie (désactivé par
défaut, pour ne pas lancer de collectes réelles à chaque redémarrage en développement local).

## Ajouter une source

1. Documenter la source dans `docs/sources.md` (endpoint, authentification, statut
   robots.txt/CGU, décision) avant d'écrire le connecteur.
2. Créer un module sous `packages/connectors/src/tier{0,1,2}/<source>/` implémentant
   l'interface `Connector` de `@job-harvester/core` (`supports`, `fetch`, `normalize`,
   `healthCheck`).
3. Ajouter au moins une fixture dans `fixtures/<source>/` et un test de `normalize` hors-ligne.
4. Enregistrer le connecteur dans la liste passée à `createApp` (`packages/api/src/server.ts`).

## Interpréter `GET /connectors/health`

Retourne, pour chaque connecteur enregistré, deux informations distinctes :

- `lastRun` : le dernier run de collecte connu en base (`rawCount`, `normalizedCount`,
  `rejectedCount`, `ok`, `errorMessage`). `null` si le connecteur n'a encore jamais été
  exécuté. Un `rejectedCount` élevé par rapport à `rawCount` peut avoir deux causes bien
  distinctes : un échec de `normalize()` (le format de réponse du connecteur a changé — à
  investiguer) ou un rejet par le filtre centralisé de campagne (contrat/mots-clés/localisation
  — cas nominal, signifie simplement que le connecteur a ramené des offres hors du périmètre
  demandé).
- `live` : le résultat d'un vrai appel `healthCheck()` fait à l'instant de la requête
  (`ok`, `latencyMs`, `message` en cas d'échec) — indépendant de `lastRun`, donc utile pour
  détecter un problème (clé expirée, panne de la source) même si aucune collecte n'a encore
  été relancée depuis.

## Export/réimport des événements de candidature

```bash
pnpm --filter @job-harvester/db exec tsx src/scripts/export-events.ts ./job-harvester.sqlite ./events-backup.json
pnpm --filter @job-harvester/db exec tsx src/scripts/import-events.ts ./job-harvester.sqlite ./events-backup.json
```

`offer.id` est un identifiant stable dérivé de `(source, sourceOfferId)` (JOB-10) : une même
offre recollectée après une reconstruction complète de la base reçoit à nouveau le même id, donc
les événements réimportés se relient correctement sans étape supplémentaire. Si une base
existante contient encore des offres avec l'ancien id aléatoire (pré-JOB-10), un script de
rattrapage ponctuel les met à niveau (met aussi à jour `application_events.offer_id` en
conséquence) — à exécuter une fois sur la base actuelle, **avant** le prochain export, sans quoi
les offres pas encore recollectées depuis la mise à niveau JOB-10 garderaient leur ancien id
jusqu'à leur prochain run :

```bash
pnpm --filter @job-harvester/db exec tsx src/scripts/recompute-offer-ids.ts ./job-harvester.sqlite
```

## Obtenir une clé API La Bonne Alternance

Voir `docs/sources.md` pour le détail de l'API. La clé s'obtient sur l'espace développeurs
`https://api.apprentissage.beta.gouv.fr` et se renseigne dans `.env` sous `LBA_API_KEY`.

## Obtenir des identifiants API France Travail

Voir `docs/sources.md` pour le détail de l'API. Les identifiants (`client_id` et
`client_secret`, deux valeurs distinctes) s'obtiennent sur l'espace développeur
`https://francetravail.io` en créant une application avec l'API "Offres d'emploi v2", et se
renseignent dans `.env` sous `FRANCE_TRAVAIL_CLIENT_ID` et `FRANCE_TRAVAIL_CLIENT_SECRET`.

## Configurer les cibles Workday et SmartRecruiters

Depuis l'ajout de la découverte automatique de cibles, `config/campaigns.yaml` n'est plus
uniquement lu : il est aussi réécrit automatiquement par l'application elle-même après chaque
collecte déclenchée manuellement. À chaque `POST /harvest/:campaignId/run`, les entreprises
nouvellement vues sont sondées sur les quatre plateformes cibles (Workday, SmartRecruiters,
Talentsoft, DigitalRecruiters) ; celles qui répondent positivement sont ajoutées automatiquement
sous `targets.<plateforme>` de chaque campagne. Concrètement, `git status` peut donc afficher des
modifications non indexées sur ce fichier après avoir lancé une collecte en local — c'est normal,
il suffit de relire le diff et de committer si les cibles ajoutées sont pertinentes. Ce
comportement a lieu sur tout appel à la route de collecte (`POST /harvest/:campaignId/run`, que
ce soit via le bouton "Lancer la collecte" ou un appel direct comme `curl`), jamais sur les
exécutions planifiées par le cron.

Contrairement à La Bonne Alternance et France Travail (qui recherchent sur tout le marché),
les connecteurs `workday` et `smartrecruiters` ciblent des entreprises précises, déclarées
sous `targets` dans `config/campaigns.yaml`. Aucune clé API n'est nécessaire pour ces deux
connecteurs — seule l'identification de la cible est requise.

**Workday** (`targets.workday`, liste de `{tenant, site, dc}`) : ouvrez la page carrière de
l'entreprise sur Workday et lisez son URL, de la forme
`https://{tenant}.{dc}.myworkdayjobs.com/{site}` — par exemple
`https://valeo.wd3.myworkdayjobs.com/valeo_jobs` donne `tenant: valeo`, `dc: wd3`,
`site: valeo_jobs`. Le `site` correspond souvent, mais pas toujours, au nom de l'espace de
recrutement affiché dans l'URL (une même entreprise peut avoir plusieurs `site` pour
différentes marques ou pays) ; vérifiez que la page liste bien des offres avant de l'ajouter.

```yaml
targets:
  workday:
    - { tenant: valeo, site: valeo_jobs, dc: wd3 }
```

**SmartRecruiters** (`targets.smartrecruiters`, liste de slugs) : ouvrez la page carrière de
l'entreprise sur SmartRecruiters, de la forme `https://jobs.smartrecruiters.com/{SLUG}` (ou
directement l'API `https://api.smartrecruiters.com/v1/companies/{SLUG}/postings` — une
réponse JSON avec `content` confirme le bon slug) — par exemple
`https://jobs.smartrecruiters.com/Mazars` donne le slug `MAZARS` (généralement en
majuscules dans l'URL de l'API, mais l'API accepte aussi la casse d'origine).

```yaml
targets:
  smartrecruiters: ["MAZARS"]
```

Les deux connecteurs dérivent leur pré-filtre du `contractTypes` effectif de la campagne plutôt
que d'un mot-clé figé : recherche/filtrage sur "alternance" quand la campagne cible
apprentissage/professionnalisation, sur "stage" quand elle cible un stage, et aucun terme (pas
de pré-filtre côté connecteur) pour les autres types de contrat, faute de mot-clé unique fiable.
Ce pré-filtre reste une optimisation réseau (limiter ce qui est ramené) — c'est le filtre
centralisé post-`normalize()` (voir "Filtre de campagne centralisé" plus haut) qui garantit le
résultat final, y compris si une entreprise ciblée ne recrute manifestement pas dans le
périmètre demandé : le connecteur ramènera alors simplement 0 résultat après filtrage.
