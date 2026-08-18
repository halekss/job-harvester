# ADR-0003 — Pas d'étape de compilation (`tsx` en dev, pas de `dist/`)

Date de la décision : 2026-08-15 (sous-projet 1)
Date de rédaction de cette ADR : 2026-08-18 (rétroactive, voir [JOB-19](https://linear.app/job-harvester/issue/JOB-19))
Statut : Accepté, à réévaluer

## Contexte

Le projet est un outil personnel, exécuté en local par son unique utilisateur (`pnpm dev:api`, `pnpm dev:web`, `pnpm harvest:run`), pas distribué ni déployé sur une infrastructure tierce à ce stade. Il n'y a donc pas de contrainte immédiate de démarrage rapide en production, de build reproductible figé, ni de packaging pour distribution.

## Décision

Ne pas introduire d'étape de compilation TypeScript → JavaScript. Tous les points d'entrée (`packages/api/src/server.ts`, scripts CLI) s'exécutent directement via `tsx` (dev) ou `vitest`/`tsc --noEmit` (tests/typecheck), sans produire de `dist/`.

## Conséquences

- Simplicité : pas de configuration de build à maintenir, pas de décalage possible entre source et artefact compilé pendant le développement.
- `tsc --noEmit` sert uniquement à la vérification de types (`pnpm typecheck`), jamais à produire du code exécutable.
- Si le projet devait un jour être déployé ailleurs qu'en local (serveur distant, conteneur, packaging pour partage), ce choix devra être réévalué : une étape de build (`tsc`/`esbuild`/`tsup`) deviendrait nécessaire pour un démarrage rapide sans dépendance à `tsx`/`typescript` en production et pour figer un artefact reproductible.
- Cette ADR doit être révisée (statut mis à jour, nouvelle ADR si changement) le jour où cette hypothèse de déploiement change.
