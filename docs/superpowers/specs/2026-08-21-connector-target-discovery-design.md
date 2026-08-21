# Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters

## Contexte

Workday, SmartRecruiters, Talentsoft et DigitalRecruiters sont des connecteurs
« par entreprise » : contrairement à LBA/France Travail/WTTJ (recherche large
via mots-clés), ils ne remontent que les offres d'entreprises explicitement
listées dans `config/campaigns.yaml` (`targets.workday`, `targets.smartrecruiters`,
`targets.talentsoft`, `targets.digitalRecruiters`). Aujourd'hui ces listes ne
contiennent qu'un ou deux exemples (Valeo, MAZARS, 7 domaines Talentsoft
trouvés manuellement cette semaine, Yzee Services) — la grande majorité des
~200 entreprises déjà vues via les autres connecteurs n'a jamais été testée
sur ces 4 plateformes.

Objectif : à chaque collecte lancée manuellement, sonder automatiquement les
entreprises nouvellement connues (jamais sondées) sur les 4 plateformes, et
ajouter à `campaigns.yaml` celles qui y sont confirmées — pour que la
prochaine collecte les inclue.

## Vue d'ensemble du flux

```
POST /harvest/:campaignId/run
  1. runCampaignAcrossConnectors(...)          <- inchangé, collecte normale
  2. discoverTargets(db, campaignsFile)        <- NOUVEAU, après la collecte
       a. lit les company_name distincts de la table offers
       b. exclut ceux déjà présents dans discovery_probes
       c. plafonne à 20 nouvelles entreprises pour ce run
       d. pour chacune, sonde les 4 plateformes (voir détection ci-dessous)
       e. enregistre chaque résultat (trouvé ou non) dans discovery_probes
       f. pour les plateformes confirmées, ajoute la cible aux DEUX
          campagnes dans campaigns.yaml et réécrit le fichier
  3. réponse API enrichie d'un résumé des découvertes de ce run
```

Ne tourne que sur un lancement manuel (`POST /harvest/:id/run` déclenché
depuis l'UI) — jamais sur le cron 7h. Les cibles découvertes s'appliquent aux
collectes suivantes, pas à celle en cours (le fichier est relu au prochain
`loadCampaigns()` / redémarrage du process — voir « Limites connues »).

## Détection par plateforme

Génération du slug à partir de `company_name` : minuscules, accents
retirés, contenu entre parenthèses supprimé, suffixes légaux courants
retirés (France, Group, Groupe, SA, SAS, SARL), mots joints par des tirets.

| Plateforme | Tentative(s) | Critère de succès |
|---|---|---|
| DigitalRecruiters | `joinus.{slug}.fr` (1 requête) | `POST .../job-ads?domainName=...` renvoie `200` avec un `count` numérique |
| SmartRecruiters | `{SLUG}` (1 requête) | `GET .../companies/{slug}/postings` renvoie `200` |
| Talentsoft | `recrutement.{slug}.fr`, `{slug}-recrute.talent-soft.com`, `{slug}-career.talent-soft.com`, `{slug}-cand.talent-soft.com`, `{slug}.talent-soft.com` (jusqu'à 5 requêtes, s'arrête au premier succès) | page racine `200` **et** marqueurs Talentsoft présents (`__VIEWSTATE`/`talentsoft`, même logique que `detectTalentsoftPlatform` existant) |
| Workday | `{slug}.wd1...`, `.wd3...`, `.wd5...myworkdayjobs.com` (jusqu'à 3 requêtes, s'arrête au premier succès) | `POST .../wday/cxs/{tenant}/{tenant}_jobs/jobs` renvoie `200` avec JSON valide. `site` est deviné par convention `{tenant}_jobs` (seul exemple connu : `valeo` → `valeo_jobs`) — encore une supposition, pas une règle garantie. |

Chaque requête passe par `isAllowedByRobots()` avant d'être tentée (même
garde-fou que Talentsoft aujourd'hui) et par le `guardedFetch` partagé
(rate-limiting par domaine, JOB-12) — pas de traitement spécial en dehors de
la réutilisation de ce qui existe déjà.

**Limite connue et assumée** : le taux de réussite sera faible, surtout pour
Workday (deux paramètres à deviner). C'est un compromis accepté — mieux vaut
sonder à l'aveugle avec un taux de succès bas que de ne rien découvrir du
tout.

## Modèle de données

Nouvelle table `discovery_probes` (`packages/db`) :

```
id             text primary key (ulid)
companyName    text not null        -- company_name normalisé (slug), unique avec platform
platform       text not null        -- "workday" | "smartrecruiters" | "talentsoft" | "digitalRecruiters"
found          integer not null     -- 0/1
target         text                 -- JSON de la cible détectée si found=1 (domaine, ou {tenant,site,dc})
probedAt       text not null
```

Contrainte unique `(companyName, platform)` : une entreprise n'est plus jamais
resondée sur une plateforme donnée une fois qu'un résultat (positif ou
négatif) existe.

## Écriture de campaigns.yaml

Une découverte confirmée est ajoutée à `targets.<platform>` des **deux**
campagnes (cohérent avec le fait qu'elles ont désormais les mêmes cibles).
Écriture via le module `yaml` déjà présent dans les dépendances, en
préservant le format existant (pas de réécriture complète depuis zéro qui
perdrait la mise en forme/commentaires). Une entrée déjà présente n'est
jamais dupliquée.

## Plafond par collecte

Au plus 20 nouvelles entreprises (jamais présentes dans `discovery_probes`)
sont sondées par lancement de collecte. Avec ~200 entreprises déjà en base
au moment du déploiement, le rattrapage initial s'étale sur une dizaine de
collectes manuelles. Une fois le stock rattrapé, chaque collecte ne sonde
que les entreprises réellement nouvelles de ce run-là (généralement
quelques-unes).

## Intégration API/UI

`POST /harvest/:campaignId/run` renvoie en plus des `summaries` habituels :

```json
{
  "summaries": [...],
  "discoveries": {
    "probed": 14,
    "found": [
      { "companyName": "...", "platform": "digitalrecruiters", "target": "joinus.xxx.fr" }
    ]
  }
}
```

`HarvestControl.tsx` affiche ce résumé sous les résultats de collecte
existants (ex. « 2 nouvelles cibles découvertes : ... »).

## Tests (TDD, comme le reste du projet)

- `discovery/slug.ts` : génération de slug à partir de noms d'entreprise
  variés (accents, parenthèses, suffixes légaux).
- `discovery/probe-*.ts` (un par plateforme) : succès/échec sur mock fetch,
  respect de robots.txt, arrêt au premier succès pour Talentsoft/Workday.
- `discovery/discover-targets.ts` : plafond de 20, exclusion des entreprises
  déjà dans `discovery_probes`, écriture correcte dans les deux campagnes,
  pas de doublon si la cible existe déjà.
- Route API : `discoveries` présent dans la réponse, absent/vide si rien de
  nouveau, jamais bloquant si un sondage échoue (n'interrompt pas la
  réponse de collecte).

## Limites connues (assumées, pas dans le scope de cette itération)

- Une cible découverte pendant un run ne s'applique qu'aux runs suivants,
  jamais à celui qui vient de la découvrir (campaigns.yaml n'est relu qu'au
  prochain chargement).
- Taux de réussite du sondage globalement faible, surtout Workday — accepté
  comme compromis plutôt que de ne rien tenter.
- Pas de nettoyage automatique si une cible découverte cesse un jour de
  fonctionner (même limite que les cibles ajoutées manuellement aujourd'hui).
