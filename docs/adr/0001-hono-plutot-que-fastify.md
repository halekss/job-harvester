# ADR-0001 — Hono plutôt que Fastify pour l'API locale

Date de la décision : 2026-08-15 (sous-projet 1)
Date de rédaction de cette ADR : 2026-08-18 (rétroactive, voir [JOB-19](https://linear.app/job-harvester/issue/JOB-19))
Statut : Accepté

## Contexte

Le cahier des charges laissait le choix du framework HTTP libre pour l'API locale (`packages/api`) qui sert le jobboard et expose les routes de collecte (`GET /offers`, `POST /harvest/:campaignId/run`, etc.). Les candidats naturels pour un service Node/TypeScript de cette taille étaient Fastify (standard de facto, écosystème de plugins mature) et Hono (plus récent, minimaliste, conçu TS-first et multi-runtime).

Le projet est un outil personnel à un seul utilisateur, exécuté en local, sans besoin d'écosystème de plugins (auth, rate-limit, observabilité packagés) ni de scalabilité au-delà d'un process unique.

## Décision

Utiliser **Hono** plutôt que Fastify.

Raisons retenues :
- Caractère TS-first : les types de contexte de requête/réponse sont inférés nativement, sans configuration de plugin de validation séparée.
- Empreinte minimale, cohérente avec un outil personnel qui n'a pas besoin de l'écosystème de plugins Fastify.
- API testable directement en mémoire via `app.request(path, init)` sans démarrer de serveur HTTP réel — utilisé systématiquement dans `packages/api/src/app.test.ts`.

## Conséquences

- Toutes les routes suivent le pattern `register*Routes(app: Hono, deps: AppDeps)` monté dans `packages/api/src/app.ts` — voir les fichiers de `packages/api/src/routes/`.
- Pas d'accès à l'écosystème de plugins Fastify (auth, swagger, rate-limit packagés) : toute fonctionnalité de ce type doit être écrite à la main si elle devient nécessaire.
- Si le projet devait un jour dépasser l'usage personnel (multi-utilisateur, déploiement partagé), ce choix mériterait d'être réévalué au vu des besoins d'écosystème à ce moment-là.
