# L'Antechinus Voyageur

Une question par jour pour Luigi et les Kritas (Jessica, Magdalena, Cristina… à chaque lettre, la Krita qui écrit se présente). Chacun écrit sa lettre ; elle reste scellée jusqu'à ce que l'autre ait écrit la sienne. Livrée par un antechinus au système immunitaire fragile.

- Site statique (HTML/JS, sans build) hébergé sur **GitHub Pages**.
- Lettres stockées dans **Firebase Firestore**, connexion par **Firebase Authentication**.
- Installable sur téléphone comme une appli (PWA).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page et son style |
| `app.js` | La logique : connexion, lettres, terrier |
| `config.js` | **À remplir** : config Firebase, vos deux e-mails, date de départ |
| `firestore.rules` | **À remplir** : vos deux e-mails, puis à coller dans Firebase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur téléphone |

## 1. Créer le projet Firebase (≈ 5 min)

1. Va sur <https://console.firebase.google.com> → **Créer un projet** (Google Analytics inutile).
2. **Build → Authentication → Commencer**, puis dans **Sign-in method** active :
   - **Adresse e-mail/Mot de passe**
   - **Google** (optionnel)
3. **Build → Firestore Database → Créer une base de données** → emplacement `eur3 (europe-west)` → **mode production**.
4. **Paramètres du projet (roue dentée) → Vos applications → icône `</>`** → donne un nom → copie l'objet `firebaseConfig` dans `config.js`.

## 2. Mettre vos e-mails

- Dans `config.js` : les adresses de `luigi` et des `kritas` (le compte partagé par toutes les Kritas).
- Dans `firestore.rules` : mêmes adresses, **en minuscules**.
- Dans la console Firebase : **Firestore → Règles** → colle tout le contenu de `firestore.rules` → **Publier**.

## 3. Mettre en ligne sur GitHub Pages

1. Crée un dépôt sur <https://github.com/new> (par ex. `antechinus-voyageur`). Il peut être **public** : la config Firebase n'est pas secrète, ce sont les règles qui protègent vos lettres. (Pages sur un dépôt privé demande un compte payant.)
2. Dans ce dossier :
   ```bash
   git remote add origin https://github.com/TON-COMPTE/antechinus-voyageur.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Source : Deploy from a branch → `main` / `/ (root)`** → Save.
4. Une minute plus tard, le site est sur `https://TON-COMPTE.github.io/antechinus-voyageur/`.
5. Dans Firebase : **Authentication → Paramètres → Domaines autorisés → Ajouter** `TON-COMPTE.github.io` (sinon la connexion Google est refusée).

## 4. L'installer sur le téléphone

- **iPhone (Safari)** : ouvrir le lien → bouton Partager → **Sur l'écran d'accueil**.
- **Android (Chrome)** : ouvrir le lien → menu ⋮ → **Installer l'application**.

Chacun crée son compte la première fois (« Créer mon compte »), confirme son e-mail, et c'est parti. Sur iPhone, la connexion e-mail + mot de passe est la plus fiable depuis l'appli installée.

## Tester en local

```bash
python3 -m http.server 8000
```
puis <http://localhost:8000>. (`localhost` est autorisé par défaut dans Firebase.)

## Ajouter une Krita

La liste est dans `KRITAS`, en haut de `app.js`. Une Krita absente de la liste peut aussi taper son nom dans « Une autre Krita… » au moment d'écrire.

## Changer les questions

Elles sont dans le tableau `Q` en haut de `app.js` : `["Thème", "Question ?"]`. La question du jour dépend du nombre de jours depuis `START` (`config.js`). Ajoute les nouvelles questions **à la fin** du tableau avant d'en avoir fait le tour (60 jours) : les jours passés gardent alors leur question.

## Coût

Gratuit : le plan Spark de Firebase couvre très largement deux personnes (50 000 lectures et 20 000 écritures par jour).
