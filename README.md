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

Retourne, pour chaque connecteur enregistré, le dernier run connu
(`rawCount`, `normalizedCount`, `rejectedCount`, `ok`, `errorMessage`). `lastRun: null`
signifie que le connecteur n'a encore jamais été exécuté. Un `rejectedCount` élevé par
rapport à `rawCount` indique un connecteur dont le format de réponse a changé.

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
