# Choix technologiques et observations v0

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
