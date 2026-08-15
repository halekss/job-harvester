# job-harvester — Sous-projet 2 : connecteur France Travail + orchestrateur multi-connecteurs

Date : 2026-08-16
Statut : approuvé, prêt pour plan d'implémentation

## Contexte

Suite du sous-projet 1 (`docs/superpowers/specs/2026-08-15-labonnealternance-e2e-design.md`), qui a livré un flux de bout en bout pour le connecteur `labonnealternance` seul. Ce sous-projet correspond au ticket Linear [JOB-5](https://linear.app/job-harvester/issue/JOB-5) : ajouter le connecteur `francetravail` et généraliser l'orchestrateur pour qu'une campagne puisse interroger plusieurs connecteurs.

**Rappel de cadrage produit** : l'outil est générique (métier/localisation configurables via `config/campaigns.yaml`), les campagnes "data"/"dev web" du sous-projet 1 sont la recherche personnelle actuelle de l'utilisateur, pas des catégories figées.

**Périmètre validé avec l'utilisateur** : généralisation *minimale* de l'orchestrateur — juste assez pour qu'une campagne interroge plusieurs connecteurs et que leurs offres soient dédupliquées entre elles. Le reste de la Phase 3 du cahier des charges (token bucket configurable, backoff exponentiel avec jitter, planification cron) reste hors périmètre, déjà tracké séparément si besoin futur.

## Recherche technique effectuée (vérifiée en direct, pas seulement documentée)

Contrairement au sous-projet 1 où une hypothèse initiale sur le chemin d'API s'est révélée fausse, cette fois l'API a été testée en direct avant d'écrire la spec :

- **Authentification** : OAuth2 *client credentials* à deux valeurs — `client_id` + `client_secret` + `scope=api_offresdemploiv2 o2dsoffre`. Endpoint token :
  `POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire`
  (form-urlencoded : `grant_type=client_credentials`, `client_id`, `client_secret`, `scope`). Réponse : `{access_token, token_type: "Bearer", expires_in, scope}`. Token vérifié valide ~1499s (~25 min) sur la clé fournie par l'utilisateur.
- **Recherche** : `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search` avec `Authorization: Bearer <token>`. Paramètres testés : `codeROME`, `commune` (code INSEE), `distance` (km). Pagination via le **header HTTP** `Content-Range: offres <first>-<last>/<total>` (pas un champ du corps JSON, à la différence de LBA).
- **Corps de réponse** : `{ resultats: [...], filtresPossibles: [...] }`.
- **Forme réelle d'une offre** (capturée en direct, offre `id: "5563369"` — la même offre "Yzee Services" déjà vue via LBA lors de la vérification live du sous-projet 1, confirmant concrètement le risque de doublon inter-connecteurs) :
  - `id`, `intitule`, `description`, `dateCreation`, `dateActualisation` (ISO 8601)
  - `lieuTravail: { libelle: "DD - Ville", codePostal, commune }` — **pas de lat/lng dans cette réponse** (à la différence de LBA qui a toujours un `geopoint`)
  - `romeCode`, `romeLibelle`, `appellationlibelle`
  - `entreprise: { nom }` (siret/website pas toujours présents)
  - `typeContrat` (code générique CDD/CDI/etc.), `typeContratLibelle`, `natureContrat` (texte libre, ex. `"Cont. professionnalisation"`), `alternance: boolean`
  - `salaire` (objet, souvent vide, `libelle` texte libre si présent — pas de structure min/max)
  - `contact` — **objet potentiellement sensible** (nom/téléphone/email recruteur selon la doc générale de l'API ; vide sur l'exemple capturé mais la structure existe)
  - `origineOffre: { origine: "1"|"2", urlOrigine, partenaires: [{ nom, url, logo }] }` — équivalent du `partner_label` de LBA : `origine: "2"` signale une offre relayée par un partenaire (nom + URL directe dans `partenaires[0]`), `origine: "1"` une offre France Travail directe.

## Décisions de cadrage

- **Auth** : `FRANCE_TRAVAIL_CLIENT_ID` et `FRANCE_TRAVAIL_CLIENT_SECRET`, deux variables d'environnement distinctes (contrairement à `LBA_API_KEY`, une seule variable ne suffit pas ici). Déjà présentes dans le `.env` local de l'utilisateur.
- **Sécurité PII** : le schéma Zod de validation de l'offre brute **n'inclut pas** `contact` ni `contexteTravail`. `rawPayload` stocke l'objet Zod-parsé (whitelisté), jamais le payload brut — cohérent avec le correctif appliqué au connecteur LBA suite à la revue finale du sous-projet 1, appliqué ici dès l'écriture initiale plutôt qu'en correctif après coup.
- **Pas de géocodage** : en l'absence de lat/lng dans la réponse, `location.lat`/`location.lng` restent `undefined` pour les offres France Travail. Pas de recours à un service de géocodage externe dans ce sous-projet (hors périmètre).
- **Dédup inter-connecteurs** : aucune modification du moteur de dédup (`packages/core`) n'est nécessaire. Les URLs de candidature LBA et France Travail pour une même offre relayée ne canonicalisent pas à l'identique (paramètres de tracking `s_o`/`s_b` non couverts par la liste actuelle de `canonicalizeUrl`), donc la fusion de ces doublons passera par le chemin de dédup **flou** (entreprise + titre + ville), pas par le chemin exact. C'est le comportement prévu par la conception à deux étages du sous-projet 1, pas une régression à corriger ici.
- **Cache du token** : le client OAuth2 garde le token en mémoire (au niveau du module, pas de la requête) et le renouvelle uniquement quand il est expiré (avec une marge de sécurité), pour éviter de redemander un token à chaque item de pagination pendant un run.

## Périmètre (fichiers touchés)

- `packages/connectors/src/tier0/francetravail/{types,client,normalize,connector}.ts` — nouveau connecteur, même structure que `labonnealternance`.
- `fixtures/francetravail/` — au moins deux fixtures : une offre directe France Travail (`origine: "1"`), une offre relayée par un partenaire (`origine: "2"`, avec `partenaires[]`) — données fictives inspirées de la forme réelle vérifiée, pas de données réelles de recruteur.
- `docs/sources.md` — nouvelle entrée `francetravail` (remplace le stub existant), documentant l'auth à deux valeurs et le chemin vérifié.
- `packages/api/src/routes/harvest.ts` — généralisation : boucle sur tous les connecteurs dont `supports(query)` est vrai pour la campagne, au lieu de chercher `labonnealternance` en dur.
- `packages/api/src/server.ts` — enregistre `francetravailConnector` en plus de `labonnealternanceConnector`.
- `.env.example` — ajout de `FRANCE_TRAVAIL_CLIENT_ID`/`FRANCE_TRAVAIL_CLIENT_SECRET` (sans valeur).
- `README.md` — section d'obtention de la clé France Travail, à l'image de celle sur LBA.

Non touchés : `packages/core` (aucun changement de schéma nécessaire), `packages/db` (aucun changement de schéma), `packages/harvester` (l'orchestrateur `runCampaign` lui-même n'a pas besoin de changer — c'est la route API qui décide quels connecteurs appeler, pas l'orchestrateur), `packages/web` (hors périmètre de ce sous-projet, voir chantier séparé JOB-20/JOB-21).

## Mapping des champs (France Travail → `NormalizedOffer`)

| Champ France Travail | Champ `NormalizedOffer` | Note |
|---|---|---|
| `id` | `sourceOfferId` | |
| `intitule` | `title` | |
| `description` | `descriptionText` | |
| `dateCreation` | `postedAt` | |
| — (absent de l'API) | `expiresAt` | reste `undefined` |
| `romeCode` | `romeCodes: [romeCode]` | tableau à un élément |
| `lieuTravail.codePostal` | `location.postalCode` | direct, pas de regex |
| `lieuTravail.libelle` (`"DD - Ville"`) | `location.city`, `location.department` | parsing sur `" - "` |
| — (absent) | `location.lat`/`lng` | `undefined` |
| `entreprise.nom` | `company.name`, `company.normalizedName` | fallback `"Entreprise inconnue"` si absent |
| `origineOffre.partenaires[0].url` si présent, sinon `origineOffre.urlOrigine` | `applyUrl` | |
| `applyUrl` canonicalisé | `canonicalUrl`, `dedupKey` | même logique que LBA |
| `origineOffre.origine === "2"` → `origineOffre.partenaires[0].nom`, sinon `undefined` | `originSource` | |
| `natureContrat` (regex `/apprentissage/i` → apprentissage, `/professionnalisation/i` → professionnalisation, sinon `autre`) | `contractType` | `alternance` sert de filtre `supports()`, pas de mapping direct |
| `salaire.libelle` si présent | `salary.min`/`max` non structurés côté FT — champ `salary` laissé `undefined` dans ce sous-projet (pas de parsing de texte libre) | simplification assumée |
| — | `sourceRefs` | même construction qu'LBA : un seul élément `{source: "francetravail", sourceOfferId, canonicalUrl}` |

## Généralisation de l'orchestrateur (route `POST /harvest/:campaignId/run`)

Avant : sélection en dur de `connectors.find(c => c.id === "labonnealternance")`.

Après : pour chaque connecteur de `deps.connectors`, vérifier `connector.supports(query)` pour au moins une des localisations de la campagne ; exécuter `runCampaign` pour chaque connecteur qui la supporte ; retourner `{ summaries: RunSummary[] }` (un élément par connecteur exécuté) plutôt qu'un unique `{ summary }`. Si aucun connecteur ne supporte la campagne, conserver le comportement 500 actuel (`{error: "no_connector_supports_campaign"}`).

`runCampaign` lui-même (dans `packages/harvester`) n'est pas modifié — il continue de prendre un seul connecteur en paramètre ; c'est la route API qui l'appelle une fois par connecteur compatible.

## Tests

- `client.ts` : cache/renouvellement du token (mock `fetch`), construction de l'URL de recherche, gestion des erreurs HTTP.
- `normalize.ts` : mapping de chaque champ contre les deux fixtures (offre directe, offre relayée), y compris le cas `contractType` apprentissage vs professionnalisation vs autre, et une vérification explicite que `contact` n'apparaît jamais dans `rawPayload` (même style de test que le correctif PII de LBA, mais dès l'origine ici).
- `connector.ts` : `supports()`, `fetch()` enveloppe correctement les items.
- `routes/harvest.ts` : test avec deux connecteurs factices (un qui supporte la requête, un qui ne la supporte pas) vérifiant que seul le premier est exécuté, et qu'avec deux connecteurs compatibles les deux tournent et `summaries` contient bien deux entrées.

## Livrables de ce sous-projet

1. `docs/sources.md` mis à jour avec l'entrée `francetravail` complète.
2. `packages/connectors/src/tier0/francetravail/` + fixtures + tests.
3. `packages/api/src/routes/harvest.ts` généralisé + test multi-connecteurs.
4. `packages/api/src/server.ts` enregistrant les deux connecteurs.
5. `.env.example` et `README.md` mis à jour.
