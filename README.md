# Révisions Méthode des J — Version 100% gratuite et permanente

Architecture sans serveur à faire tourner soi-même : tout vit sur des services
gratuits qui restent actifs en continu (Google Apps Script, GitHub Actions,
GitHub Pages). Vous codez et déployez depuis votre PC, mais rien ne dépend
de le laisser allumé.

```
┌─────────────────┐      lit/écrit       ┌──────────────────┐
│  GitHub Pages    │ ──────────────────►  │  Google Apps      │
│  (l'app, statique)│                     │  Script (API)      │
└─────────────────┘                       └────────┬──────────┘
                                                     │ lit/écrit
                                                     ▼
                                            ┌──────────────────┐
                                            │  Google Sheet     │
                                            │  (vos données)    │
                                            └────────┬──────────┘
                                                     ▲ lit / marque notifié
┌─────────────────┐    tous les jours 8h   ┌────────┴──────────┐
│  GitHub Actions  │ ──────────────────────►│  envoie les push  │
│  (cron gratuit)  │                        │  via pywebpush     │
└─────────────────┘                        └──────────────────┘
```
URL: https://script.google.com/macros/s/AKfycbx0UEPG7ciaJs_HtIH9P7eJYzfR4YpEeU_0q_9ejJUvjmTHBO9QD6ce1jn8lcaW6wDM8g/exec

## Étape 1 — Créer le Google Sheet + Apps Script

1. Allez sur [sheets.google.com](https://sheets.google.com), créez un nouveau
   classeur (ex: "Révisions Médecine")
2. Menu **Extensions → Apps Script**
3. Supprimez le code par défaut, collez le contenu de `apps-script/Code.gs`
4. Cliquez sur **Déployer → Nouveau déploiement**
   - Type : **Application Web**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
5. Autorisez les permissions demandées (c'est votre propre script, sur votre
   propre compte — normal que Google demande confirmation)
6. Copiez l'**URL de déploiement** (ressemble à
   `https://script.google.com/macros/s/AKfycb.../exec`) — vous en aurez besoin
   deux fois : dans le frontend et dans GitHub Actions

⚠️ Si vous modifiez `Code.gs` plus tard, il faut **redéployer** (Déployer →
Gérer les déploiements → icône crayon → Nouvelle version) pour que les
changements soient pris en compte sur l'URL publique.

## Étape 2 — Configurer le frontend

Dans `docs/index.html`, remplacez les deux lignes en haut du `<script>` :

```js
const APPS_SCRIPT_URL = "__APPS_SCRIPT_URL__";   // → collez l'URL de l'étape 1
const VAPID_PUBLIC_KEY = "__VAPID_PUBLIC_KEY__"; // → contenu de vapid_public.txt fourni
```

## Étape 3 — Créer le dépôt GitHub et activer GitHub Pages

1. Créez un nouveau dépôt sur GitHub (public ou privé, les deux fonctionnent)
2. Poussez tout le contenu de ce dossier dedans
3. **Settings → Pages** → Source : **Deploy from a branch** → Branch : `main`,
   dossier : **/docs**
4. GitHub vous donne une URL du type `https://votre-pseudo.github.io/votre-repo/`
   → c'est l'app à ouvrir sur votre téléphone / à mettre en favori

## Étape 4 — Configurer GitHub Actions (l'envoi automatique des notifs)

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New
repository secret**, ajoutez 3 secrets :

| Nom du secret | Valeur |
|---|---|
| `APPS_SCRIPT_URL` | La même URL que l'étape 1 |
| `VAPID_PRIVATE_KEY` | Le contenu complet du fichier `vapid_private.pem` fourni |
| `VAPID_CLAIMS_EMAIL` | `mailto:votre-vrai-email@exemple.com` |
| `GITHUB_PAGES_URL` | L'URL de l'étape 3, ex: `https://votre-pseudo.github.io/votre-repo` |

Le workflow `.github/workflows/check-reviews.yml` est déjà configuré pour
tourner chaque jour à 8h (heure de Paris, ajustable dans le fichier). Vous
pouvez aussi le déclencher manuellement pour tester : onglet **Actions** du
dépôt → sélectionnez le workflow → **Run workflow**.

## Étape 5 — Tester

1. Ouvrez votre URL GitHub Pages sur votre téléphone
2. **Sur iPhone** : ajoutez d'abord à l'écran d'accueil (bannière dans l'app)
3. Activez les notifications
4. Créez une fiche de test
5. Dans le Google Sheet, modifiez manuellement la colonne `date_prevue` de la
   première ligne de "Reviews" pour mettre la date d'aujourd'hui (pour ne pas
   attendre demain)
6. Déclenchez le workflow manuellement (Actions → Run workflow)
7. Vous devriez recevoir la notification en quelques secondes

## Système de maîtrise

Chaque fiche appartient à une **matière** (plusieurs cours possibles par matière —
regroupés automatiquement sur l'écran d'accueil).

Quand une révision arrive à échéance, la notification vous amène sur la fiche,
où deux boutons apparaissent :

- **✅ Maîtrisé** → toutes les révisions futures restantes pour cette fiche sont
  annulées, la fiche passe en statut "🏆 Maîtrisée"
- **❌ Pas encore** → rien n'est modifié, le planning initial (J3, J7, J15...)
  continue normalement jusqu'à la prochaine échéance

## Ce que vous gagnez avec cette architecture

- **0€**, aucune limite de durée (contrairement au tier gratuit de Render qui
  vous forçait à payer pour rester fiable)
- **Rien à laisser allumé** — Google et GitHub font tourner tout ça pour vous
- **Données dans votre Drive** — vous pouvez ouvrir le Google Sheet à tout
  moment pour consulter/éditer vos fiches directement
- Vraies notifications push, pas de simples emails

## Limites à connaître

- **GitHub Actions cron** peut avoir quelques minutes de retard aux heures de
  forte charge (rare, mais ce n'est pas une garantie à la seconde près)
- **Apps Script** a des quotas d'usage quotidiens généreux pour un usage perso
  (des dizaines de milliers d'appels/jour), largement suffisants ici
- Si vous rendez le dépôt GitHub **public**, n'importe qui connaissant l'URL
  Apps Script pourrait théoriquement ajouter des fiches ou s'abonner — pour un
  usage perso/entre amis c'est un risque faible, mais gardez le dépôt
  **privé** si vous préférez plus de discrétion (GitHub Pages reste
  accessible publiquement même sur un dépôt privé, sauf plan Enterprise — seul
  le code source est caché)
