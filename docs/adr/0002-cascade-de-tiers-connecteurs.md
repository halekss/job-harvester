# ADR-0002 — Cascade de tiers de connecteurs plutôt qu'un scraper par site

Date de la décision : 2026-08-15 (sous-projet 1), confirmée et étendue au sous-projet 2 (2026-08-16, [JOB-5](https://linear.app/job-harvester/issue/JOB-5))
Date de rédaction de cette ADR : 2026-08-18 (rétroactive, voir [JOB-19](https://linear.app/job-harvester/issue/JOB-19))
Statut : Accepté

## Contexte

Le job-harvester doit collecter des offres depuis un grand nombre de sources hétérogènes : API publiques officielles (France Travail, La Bonne Alternance), ATS SaaS avec endpoints JSON internes exploitables (Workday, SmartRecruiters), et à terme des sites sans API ni endpoint structuré. Écrire un scraper HTML dédié par site cible ne passe pas à l'échelle : chaque site a sa propre structure, se casse silencieusement au moindre changement de markup, et demande une maintenance individuelle proportionnelle au nombre de sources.

## Décision

Organiser les connecteurs en **cascade de tiers**, du plus robuste/économe au plus coûteux/fragile, chaque connecteur étant classé dans le tier le plus robuste possible pour sa source :

- **Tier 0** — API publique officielle avec authentification dédiée (`francetravail`, `labonnealternance`).
- **Tier 1** — endpoint JSON exploitable d'un ATS SaaS générique, réutilisable sur tout site qui utilise le même ATS (`workday`, `smartrecruiters`, à terme `welcometothejungle`/`talentsoft`/`digitalrecruiters` — voir [JOB-31](https://linear.app/job-harvester/issue/JOB-31)).
- **Tier 2** — flux structuré générique (JSON-LD `JobPosting`, sitemap) quand ni API ni endpoint ATS connu n'existe, avec respect strict de `robots.txt` (voir [JOB-7](https://linear.app/job-harvester/issue/JOB-7)).
- **Tier 3 (non implémenté à ce jour)** — navigateur headless, en dernier recours uniquement, pour les sites sans aucune des options précédentes.

L'interface commune `Connector` (`packages/core/src/schemas/connector.ts` : `id`, `tier`, `supports()`, `fetch()`, `normalize()`, `healthCheck()`) est la même quel que soit le tier, ce qui permet à l'orchestrateur de les traiter uniformément.

## Conséquences

- Ajouter une nouvelle source commence toujours par identifier le tier le plus robuste disponible, jamais par écrire un scraper HTML par défaut.
- Un connecteur Tier 1 (endpoint ATS générique) couvre potentiellement plusieurs sites d'un coup, contrairement à un scraper par site — meilleur retour sur investissement de maintenance.
- Le tier d'un connecteur est visible dans son code (`connector.tier: 0|1|2`) et sert directement de label lors de la remontée d'incidents dans Linear (voir [JOB-8](https://linear.app/job-harvester/issue/JOB-8)), donnant une lecture immédiate de la fragilité relative de chaque source en observabilité.
- Le tier headless (navigateur automatisé) reste hors périmètre tant qu'aucune source ne l'exige — à réévaluer si une source cible n'a ni API, ni endpoint ATS, ni flux structuré.
