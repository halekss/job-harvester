# Pipeline hybride "Quai & Pipeline" — design final

**Contexte.** Le jobboard (`packages/web`) affiche aujourd'hui les offres dans un tableau unique (`OfferTable`) avec 6 boutons d'action indépendants par ligne (`EventButtons` : Candidature/Spontané/Relance/Entretien/Refus/Sans réponse, chacun togglable seul). Ce document remplace ce tableau par une interface "Quai & Pipeline" : un bandeau de réception (offres non triées) au-dessus d'un Kanban à 6 voies. Il fige les décisions de design (validées en session : thème "Clean Light" + Inter/JetBrains Mono, cf. artifact UX/UI) et les décisions d'architecture nécessaires à leur implémentation.

## Décisions actées

### 1. Statut unique par offre (changement de modèle)

Un Kanban ne peut pas placer une carte dans deux voies à la fois. `EventButtons` autorisait plusieurs événements actifs simultanés par offre (`applied` + `interview` en même temps) — ce modèle est remplacé par un **statut courant unique**, dérivé du dernier événement enregistré. C'est exactement la logique déjà implémentée par `deriveStatus()` (`packages/api/src/routes/offers.ts:18`) et déjà utilisée par `GET /stats` (`byStatus`) et par `GET /offers/:id` — elle n'existait simplement pas encore sur `GET /offers` (liste), qui n'exposait que `activeEvents` (multi-flags).

- `GET /offers` gagne un champ `status: string` par offre, calculé avec `deriveStatus(events)` sur l'ensemble des événements de l'offre (pas seulement le dernier par type).
- Une offre sans événement a `status: "new"` → c'est le contenu du **Quai**.
- Une offre avec au moins un événement a `status` égal au type de son événement le plus récent (`applied`, `spontaneous`, `followup`, `interview`, `rejected`, `no_reply`) → c'est sa voie dans le **Pipeline**.
- "Déplacer une carte vers une voie" = `POST /offers/:id/events { type }` avec le type de la voie cible. Pas de suppression d'événement : l'historique reste complet, seul le dernier événement détermine la voie affichée (identique à `deriveStatus`). L'invalidation de cache qui suit ce POST cible le préfixe `["offers"]`, que React Query fait déjà matcher toute query `["offers", filters]` — la mutation n'a donc pas besoin de connaître les filtres actifs.
- `EventButtons.tsx`, `useToggleOfferEvent.ts` et leurs tests sont supprimés (remplacés par l'interaction clavier/glisser du Pipeline, section 4). `BulkActionBar` (sélection multi-lignes + "Marquer comme relancé") est retirée avec `OfferTable` : la sélection multiple par cases à cocher n'a pas d'équivalent Kanban dans ce lot ; le clavier (`1`–`6` sur une carte à la fois) est le remplacement rapide. Un multi-select Kanban pourra revenir dans un lot ultérieur si besoin.
- `activeEvents` reste dans `OfferSummary` (déjà consommé ailleurs potentiellement) mais n'est plus utilisé par l'UI Pipeline — seul `status` pilote l'affichage.

### 2. Six voies, pas cinq

Le brief initial ne citait que 5 actions (Candidature/Spontané/Relance/Refus/Entretien) mais le produit a déjà un 6ᵉ type (`no_reply`, "Sans réponse") avec bouton, couleur et tests dédiés. On ne supprime pas une fonctionnalité existante : le Pipeline a **6 voies**, dans l'ordre déjà utilisé par `EVENT_TYPES` : Candidature, Spontané, Relance, Entretien, Refus, Sans réponse.

### 3. Thème "Clean Light" (remplace "console de récolte")

`packages/web/src/index.css` (`@theme`) passe intégralement aux valeurs suivantes — plus de charbon/ambre/Fraunces :

```
--color-background: #FAFAFA
--color-surface: #FFFFFF
--color-surface-raised: #F4F4F5
--color-border: #E4E4E7
--color-border-soft: #EDEDF0
--color-text: #09090B
--color-text-muted: #71717A
--color-text-faint: #A1A1AA
--color-accent: #1D4ED8        /* accent d'action (bouton Collecter), jamais réutilisé par un badge de statut */
--color-accent-solid: #2563EB
--color-danger: #DC2626

--font-display: "Inter", ui-sans-serif, system-ui, sans-serif
--font-body: "Inter", ui-sans-serif, system-ui, sans-serif
--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace
```

Statuts — paire (fond 10 %, texte) au repos, (fond plein, texte) au survol/sélection :

| Statut (`type`) | Label | bg repos | texte repos | solid survol | texte sur solid |
|---|---|---|---|---|---|
| *(aucun événement)* | Collecté | `#F4F4F5` | `#52525B` | `#71717A` | `#FFFFFF` |
| `applied` | Candidature | `#EFF6FF` | `#1D4ED8` | `#2563EB` | `#FFFFFF` |
| `spontaneous` | Spontané | `#F5F3FF` | `#6D28D9` | `#7C3AED` | `#FFFFFF` |
| `followup` | Relance | `#FEF3C7` | `#B45309` | `#F59E0B` | `#451A03` |
| `interview` | Entretien | `#D1FAE5` | `#047857` | `#059669` | `#FFFFFF` |
| `rejected` | Refus | `#FEE2E2` | `#B91C1C` | `#DC2626` | `#FFFFFF` |
| `no_reply` | Sans réponse | `#F4F4F5` | `#52525B` | `#71717A` | `#FFFFFF` |

Ajustement fait par rapport aux valeurs "dark mode" fournies en session (ex. `#3B82F6` pour Candidature) : les teintes "texte" ci-dessus sont volontairement plus foncées (700-ish) pour tenir un contraste AA sur badge 10–13px en fond clair.

### 4. Architecture split-view

- Split **horizontal** : `Quai` (bandeau, offres `status === "new"`, défilement horizontal) au-dessus, `Pipeline` (grille 6 colonnes, une par statut) en dessous, pleine largeur.
- `Quai` : replié par défaut sous 700px ; sur desktop, toujours visible avec bouton replier/déplier.
- Chaque voie du `Pipeline` défile verticalement de façon indépendante (`overflow-y: auto`, hauteur fixe de la grille de voies).
- Sous 700px, les voies passent en onglets horizontaux (une voie visible à la fois) plutôt qu'un scroll horizontal à 6 colonnes.

### 5. Interaction carte → changement de statut

Une carte affiche : titre (lien natif vers `applyUrl ?? canonicalUrl`), ville, source, badge de statut. Trois façons de changer son statut, jamais 6 boutons visibles en permanence :

- **Clavier** (mode principal) : `j`/`k` carte suivante/précédente dans la voie active, `h`/`l` voie précédente/suivante, `1`–`6` assigne le statut correspondant à la carte sélectionnée (`1`=Candidature … `6`=Sans réponse), `Enter` ouvre le lien de l'offre, `Escape` désélectionne. Halo de focus visible (`outline` bleu 2px) sur la carte active.
- **Glisser-déposer** natif HTML5 (`draggable`, `dragstart`/`dragover`/`drop`) depuis une poignée dédiée sur la carte — pas la carte entière — vers une voie ; la voie survolée pendant le drag prend un liseré de sa couleur `solid`.
- Le tactile/swipe (menu radial) et le multi-select ne sont **pas** dans ce lot (voir §1).

### 6. Bouton de collecte — 4 états

Réutilise `HarvestControl` existant (mutation `runHarvest`) sans changer son API, seulement son affichage :

1. **Repos** : bouton plein `--color-accent-solid`, "Lancer la collecte".
2. **Chargement** : libellé qui défile les `connectorId` au fur et à mesure que `summaries` arrivent — impossible à afficher incrémentalement avec l'API actuelle (une seule réponse `POST /harvest/:id/run` groupée, pas de flux). Ce lot affiche donc un état de chargement statique ("Collecte en cours…", déjà existant) plutôt qu'un manifeste connecteur-par-connecteur ; le manifeste incrémental nécessiterait un changement d'API (SSE/polling) hors scope ici.
3. **Succès** : au lieu du panneau de journal seul, un flash bref (`--color-status: entretien solid`, ~1.2s) sur le bouton avec le compte d'offres nouvellement en statut "new" depuis ce run, puis retour à l'état repos. Le panneau de journal détaillé (déjà existant) reste disponible en dessous.
4. **Échec** : bouton en `--color-danger`, libellé concret ("N connecteur(s) en échec"), le panneau détaillé (déjà existant, développé automatiquement) liste connecteur + raison.

### 7. Filtres

`OfferFilters` actuel (`city`, `contractType`, `q`, `campaignId`) ne change pas côté API. Deux filtres supplémentaires, **client uniquement** (comme `followUpOnly` déjà dans `App.tsx`, filtré sur les offres déjà chargées) :

- **Masquer les refus** : cache la voie `rejected` (réduite à une colonne fine avec juste son compteur) — ne retire rien côté serveur.
- **Filtrer par source** : chips togglables par valeur de `offer.source` présente dans la page courante — filtre client sur `displayedOffers`, pas un paramètre d'API.

Le filtre "Ville" existant (texte libre, un seul champ, déjà relié à l'API) est conservé tel quel, juste reskiné.

## Hors scope de ce lot

- Manifeste de collecte incrémental (nécessite SSE/polling côté API).
- Swipe tactile / menu radial.
- Multi-sélection de cartes / actions groupées (remplace `BulkActionBar`).
- Filtre "source" et "ville multi-chips" côté serveur (restent client-side / mono-valeur).
- Animation "compteur qui atterrit sur le Quai" inter-composants (le succès reste local au bouton).
