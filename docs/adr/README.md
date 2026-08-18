# Architecture Decision Records

Ce dossier documente les décisions d'architecture structurantes du projet, au format ADR léger (Contexte / Décision / Conséquences).

La plupart des ADR listées ci-dessous sont **rétroactives** : elles documentent des choix pris pendant le sous-projet 1 (2026-08-15) sans avoir été formalisées à l'époque (voir [JOB-19](https://linear.app/job-harvester/issue/JOB-19)). Les ADR futures doivent être écrites au moment de la décision, pas après coup.

## Index

| # | Titre | Statut |
|---|-------|--------|
| [0001](0001-hono-plutot-que-fastify.md) | Hono plutôt que Fastify pour l'API locale | Accepté (rétroactif) |
| [0002](0002-cascade-de-tiers-connecteurs.md) | Cascade de tiers de connecteurs plutôt qu'un scraper par site | Accepté (rétroactif) |
| [0003](0003-pas-de-compilation-en-sous-projet-1.md) | Pas d'étape de compilation (`tsx` en dev, pas de `dist/`) | Accepté (rétroactif, à réévaluer) |
| [0004](0004-rawpayload-whiteliste-anti-pii.md) | `rawPayload` stocke l'objet Zod-validé, jamais le payload brut | Accepté (rétroactif) |
