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

La réponse a la forme `{ summaries: [...] }` : un résumé (`rawCount`, `normalizedCount`,
`rejectedCount`) par connecteur supportant la campagne. Les offres apparaissent ensuite dans
le jobboard (`pnpm dev:web`).

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
  exécuté. Un `rejectedCount` élevé par rapport à `rawCount` indique un connecteur dont le
  format de réponse a changé.
- `live` : le résultat d'un vrai appel `healthCheck()` fait à l'instant de la requête
  (`ok`, `latencyMs`, `message` en cas d'échec) — indépendant de `lastRun`, donc utile pour
  détecter un problème (clé expirée, panne de la source) même si aucune collecte n'a encore
  été relancée depuis.

## Export/réimport des événements de candidature

```bash
pnpm --filter @job-harvester/db exec tsx src/scripts/export-events.ts ./job-harvester.sqlite ./events-backup.json
pnpm --filter @job-harvester/db exec tsx src/scripts/import-events.ts ./job-harvester.sqlite ./events-backup.json
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

Les deux connecteurs filtrent déjà les offres non pertinentes (mot-clé "alternance" dans le
titre côté Workday, titre contenant "alternance"/"apprentissage"/"apprenti" côté
SmartRecruiters) — inutile de cibler une entreprise pour un métier qu'elle ne recrute
manifestement pas en alternance, le connecteur ramènerait simplement 0 résultat.
