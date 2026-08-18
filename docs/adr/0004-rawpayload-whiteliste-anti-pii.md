# ADR-0004 — `rawPayload` stocke l'objet Zod-validé, jamais le payload brut

Date de la décision : correctif appliqué en fin de sous-projet 1 (2026-08-15) sur le connecteur `labonnealternance`, puis appliqué dès l'écriture initiale sur les connecteurs suivants (`francetravail`, `workday`, `smartrecruiters`, sous-projet 2, 2026-08-16)
Date de rédaction de cette ADR : 2026-08-18 (rétroactive, voir [JOB-19](https://linear.app/job-harvester/issue/JOB-19))
Statut : Accepté

## Contexte

Chaque offre normalisée conserve un champ `rawPayload` (JSON intégral) à des fins de traçabilité et de débogage — voir le schéma de `packages/db/src/schema.ts`. Plusieurs sources exposent, dans leur réponse brute, des champs potentiellement sensibles côté recruteur (nom, téléphone, email direct — ex. le champ `contact` de l'API France Travail). Stocker le payload API brut tel quel dans `rawPayload` risquait donc de faire fuiter des informations personnelles (PII) de tiers non consentants dans la base locale, sans que ce soit nécessaire au fonctionnement de l'outil.

Ce risque a été identifié en fin de sous-projet 1, lors de la revue finale du connecteur `labonnealternance`, et corrigé à ce moment-là.

## Décision

`rawPayload` ne stocke **jamais** le payload brut reçu de l'API source. Il stocke l'objet déjà validé par le schéma Zod de l'offre brute (`RawOfferSchema` ou équivalent par connecteur), qui **whiteliste** explicitement les champs conservés — les champs sensibles (contact recruteur, contexte de travail, etc.) sont exclus du schéma Zod en amont, donc absents de `rawPayload` par construction plutôt que filtrés a posteriori.

Appliqué rétroactivement sur `labonnealternance` (correctif), puis dès l'écriture initiale sur `francetravail`, `workday` et `smartrecruiters`.

## Conséquences

- Chaque nouveau connecteur doit définir un schéma Zod de l'offre brute qui exclut explicitement tout champ contact/recruteur/PII avant de l'assigner à `rawPayload` — ne jamais faire `rawPayload: rawApiResponse` directement.
- Les tests de normalisation de chaque connecteur incluent une vérification explicite que les champs sensibles n'apparaissent jamais dans `rawPayload` (voir par exemple `packages/connectors/src/tier0/francetravail/normalize.test.ts`), pas seulement que les champs utiles sont bien mappés.
- Un nouveau champ ajouté par une source à l'avenir (ex. changement de l'API upstream) n'est **pas** automatiquement inclus dans `rawPayload` — la whitelist Zod doit être mise à jour explicitement pour l'exposer, ce qui est le comportement de sécurité recherché (fail-closed plutôt que fail-open).
