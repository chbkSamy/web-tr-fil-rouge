# Choix technologiques et observations v0

> Les mentions de SSE, `EventSource`, `Last-Event-ID` et `/api/stream` décrivent uniquement la v0. Ces mécanismes sont supprimés en v1 : aucune route, aucun code client/serveur ni proxy SSE ne subsiste ; seules ces mentions historiques restent.

## Tableau des choix

| Besoin | Sens des échanges | Fréquence | Latence tolérée | Perte tolérée | Données |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Messages et accusés** | **Bidirectionnel **<br>- Émission : Client → Serveur<br>- Diffusion : Serveur → Tous les clients | Moyenne à élevée : 10 à 100 messages/min en pointe | Faible à moyenne : 1 à 2 s | **Aucune** : accusé HTTP + ordre séquentiel par ID | Texte (JSON / UTF-8) |
| **2. Présence et saisie** | **Bidirectionnel **<br>- Présence : Serveur → Clients<br>- Saisie : Client → Serveur → Clients | Présence : faible, événementielle.<br>Saisie : haute, rafales de 5 à 10 événements/s, throttlées à 300 ms. | Présence : < 1 s.<br>Saisie : < 50 ms. | Présence : **aucune** (liste exacte).<br>Saisie : **élevée** (seul l'état courant compte). | Texte (JSON / événements légers) |
| **3. Note partagée** | **Bidirectionnel **<br>- Modification : Client → Serveur<br>- Diffusion de version : Serveur → Clients | Moyenne : quelques modifications par minute | Faible à moyenne : 1 à 2 s | **Aucune** : cohérence stricte des versions et détection de conflits | Texte (JSON / version + contenu) |
| **5. Reprise après coupure** | **Bidirectionnel**<br>- Le client renvoie son dernier ID connu (`Last-Event-ID`)<br>- Le serveur rejoue les événements manqués | Ponctuelle : à chaque reconnexion | Moyenne : < 500 ms | **Aucune** : restitution intégrale sans trou ni doublon | Texte (JSON / flux d'événements ordonnés) |

## Observations v0

### Démarrage
- Serveur : `cd server && npm run dev` → `http://localhost:3000`
- Client : `cd client && npm run dev` → `http://localhost:5173`
- Commande unique :`npm run dev` → lance server et client
### Diffusion et accusés
- Un `POST /api/messages` valide renvoie `201` avec `{ id, author, text, at }`.
- Un message envoyé depuis un onglet apparaît dans tous les onglets ouverts, sans rechargement.
- L'expéditeur reçoit son message par SSE ; il n'est pas ajouté localement, donc pas de doublon.

### Connexion et coupure
- `curl -N http://localhost:3000/api/stream` reste ouvert.
- À l'arrêt du serveur, l'interface passe à « Déconnecté ».
- Au redémarrage, `EventSource` se reconnecte automatiquement ; l'interface repasse à « En ligne ».
- Avec `Last-Event-ID`, le serveur rejoue les messages manqués.
- Au premier chargement, aucun historique n'est chargé : `GET /api/messages` n'existe pas en v0.

### Redémarrage du serveur
- Les messages sont perdus (stockage en mémoire).
- `nextId` repart à 1.
- Un ancien message `id: 1` peut coexister avec un nouveau `id: 1` côté client.
- Conséquence : clés Vue en double et affichage potentiellement incohérent.

### Mesures
- Latence locale observée : premier `POST /api/messages` ~22 ms, puis ~5.2 ms (mesuré via l'onglet Réseau > Timing > TTFB sur `http://localhost:3000/api/messages`, en filtrant uniquement sur les requêtes vers le serveur).
- Requêtes : 1 `POST /api/messages` par message envoyé ; 1 `GET /api/stream` (EventSource) persistante par onglet ouvert ; 1 événement `message` diffusé par message à chaque client connecté.
- Connexions SSE : 1 par onglet ouvert.
- Coupure serveur (arrêt/reprise via Ctrl+C) : l'indicateur passe en « Déconnecté », `EventSource` se reconnecte automatiquement au redémarrage et repasse en « En ligne ». Les messages manqués sont rejoués grâce à `Last-Event-ID` (vérifié avec `curl -N -H "Last-Event-ID: ..."`).

## Observations v1

### Démarrage et vérifications
- Commande unique : `npm run dev` depuis la racine.
- Serveur : `ws://localhost:3000/ws/v1`.
- Tests de validation sans serveur : `npm test` depuis la racine.
- Vérification d'intégration serveur seule : `npm run check` depuis la racine.

### Ce que WebSocket a apporté
- Un seul canal persistant remplace `POST /api/messages` + `GET /api/stream`. Il n'y a plus de requête HTTP par message.
- L'émission, la réception et les erreurs passent par le même protocole JSON versionné (`v: 1`).
- Le serveur porte l'identité de la connexion : `author` n'est plus renvoyé à chaque message.
- Les erreurs de protocole ont un code stable (`INVALID_JSON`, `UNKNOWN_TYPE`, etc.) et, pour les erreurs fatales, un code de fermeture WebSocket.
- Le heartbeat ping/pong détecte les connexions mortes sans attendre une écriture applicative.
- Mesure locale de la v1 : 20 messages envoyés et reçus par le même client, temps entre `send` et réception de `server.message.created` — moyenne ~0,59 ms, médiane ~0,49 ms, maximum ~1,42 ms. Ce n'est pas directement comparable aux ~5,2 ms de TTFB de la v0 : la mesure v1 inclut l'aller-retour WebSocket complet, pas une requête HTTP séparée.

### Ce que WebSocket a fait perdre
- La reconnexion automatique d'`EventSource` disparaît. En v1, l'utilisateur doit se reconnecter à la main.
- La reprise des messages manqués par `Last-Event-ID` disparaît. Le serveur ne garde aucun historique : les messages perdus pendant une coupure ne reviennent pas.
- `id` repart à `1` après un redémarrage du serveur. Le client vide sa liste à chaque nouvelle connexion pour éviter les doublons.
- L'identité est liée à la connexion, pas à la page ni à l'utilisateur : changer de pseudo impose de rouvrir une connexion.
- Le client doit gérer lui-même les états de connexion et l'affichage du code de fermeture, ce que le navigateur faisait en partie pour SSE.
