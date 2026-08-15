# Rapport de fin de session — Sous-projet 1 (labonnealternance de bout en bout)

Date : 2026-08-15
Périmètre : `docs/superpowers/specs/2026-08-15-labonnealternance-e2e-design.md`, exécuté via `docs/superpowers/plans/2026-08-15-labonnealternance-e2e.md`.

## Sources effectivement couvertes et volume obtenu

| Source | Tier | Statut | Volume observé |
|---|---|---|---|
| `labonnealternance` (`api.apprentissage.beta.gouv.fr/api/job/v1/search`) | 0 | Opérationnel, vérifié en live | 1 run de test réel : 2 offres brutes reçues, 2 normalisées, 0 rejet Zod, 1 offre stockée après dédup (voir ci-dessous) |

Un seul run réel a été exécuté pendant cette session, sur la campagne `alternance-data-hdf` (codes ROME M1403/M1805, Lille + Amiens, rayon 30 km). Ce n'est pas un volume représentatif d'un usage en production — juste la preuve que le flux collecte → normalise → dédup → base → API → interface fonctionne de bout en bout avec de vraies données.

La campagne "développement web" prévue par le cahier des charges d'origine n'a pas encore été configurée (voir [JOB-18](https://linear.app/job-harvester/issue/JOB-18)), donc aucun volume n'a été mesuré sur ce second axe métier.

## Sources écartées

Aucune source n'a été formellement évaluée puis écartée pendant ce sous-projet : seule `labonnealternance` a été implémentée, conformément à l'ordre d'implémentation imposé par le cahier des charges ("le connecteur labonnealternance seul doit produire un flux exploitable avant qu'un second connecteur soit écrit"). `francetravail` a un stub dans `docs/sources.md` mais n'a pas encore de connecteur.

Sont exclues par contrainte non négociable du cahier des charges, sans évaluation au cas par cas nécessaire : Indeed, LinkedIn, Glassdoor, et toute plateforme dont les CGU interdisent le scraping ou qui nécessite un contournement anti-bot.

## Taux de doublons détectés et fusionnés

Sur l'unique run réel de cette session : 2 offres brutes → 1 offre stockée, soit une fusion sur ce lot de test (probablement la même offre remontée par les deux localisations interrogées — Lille et Amiens partagent une zone de recherche qui se recoupe pour certaines offres). Échantillon bien trop petit (n=2) pour en tirer un taux de doublons généralisable ; à réévaluer une fois des runs réguliers en place (dépend de [JOB-8](https://linear.app/job-harvester/issue/JOB-8), l'observabilité, pour un suivi dans la durée).

Le moteur de dédup lui-même (exact + flou, `packages/core/src/dedup/`) est validé unitairement de façon indépendante, y compris sur le cas des deux URLs identiques à paramètres de tracking différents cité en exemple dans le cahier des charges.

## Connecteurs jugés fragiles et pourquoi

**`labonnealternance`** : pas fragile en fonctionnement normal une fois corrigé, mais une vraie fragilité a été révélée pendant la vérification live de cette session : le chemin d'API documenté dans le code source public du fournisseur (`/job/v1/search`) diffère du chemin réellement servi en production (`/api/job/v1/search`) — sans préfixe, l'hôte renvoie silencieusement la page d'accueil du site (HTTP 200, HTML) au lieu d'une erreur claire. Corrigé (commit `f014165`), mais ce type de dérive silencieuse entre doc et prod peut se reproduire sans avertissement si le fournisseur change son routage. Aucune alerte automatique n'existe encore pour détecter une régression de ce type en production ([JOB-8](https://linear.app/job-harvester/issue/JOB-8), Phase 5, non implémentée dans ce sous-projet) — aujourd'hui, seule une vérification manuelle de `GET /connectors/health` permettrait de la repérer, et cette route ne fait elle-même pas de ping live du connecteur ([JOB-16](https://linear.app/job-harvester/issue/JOB-16)).

## État des livrables du sous-projet 1

Tous livrés et mergés sur `main` (28 commits du plan + 3 commits de la revue finale de branche) :

1. `docs/sources.md` — entrée `labonnealternance` complète.
2. `packages/core` — types, schémas Zod, canonicalisation URL, moteur de dédup, tests couvrant le cas des deux URLs identiques.
3. `packages/connectors` — connecteur `labonnealternance` + fixtures + tests de normalisation.
4. `packages/harvester` — orchestrateur, configuration YAML, rate-limiting basique, journalisation.
5. `packages/db` — schéma Drizzle + migrations.
6. `packages/api` — routes de la Phase 6 (sous-ensemble : offers, events, harvest, health).
7. `packages/web` — jobboard minimal fonctionnel (liste, événements) — **hors périmètre : la qualité visuelle/UX** ([JOB-17](https://linear.app/job-harvester/issue/JOB-17)).
8. `README.md` — démarrage, ajout de source, interprétation de `/connectors/health`.
9. Ce rapport.

Non livrés dans ce sous-projet (hors périmètre assumé, voir décomposition dans le design spec) : connecteurs France Travail/Tier 1/Tier 2, intégration Linear automatique, jobboard Phase 7 complet, `docs/adr/`. Tous ticketés dans le backlog Linear ([JOB-5](https://linear.app/job-harvester/issue/JOB-5) à [JOB-19](https://linear.app/job-harvester/issue/JOB-19)).
