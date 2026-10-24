# Rapport d'Analyse et de Choix Techniques — Séance 1

## Étape 1 — Caractériser chaque besoin

| Besoin | Sens des échanges | Fréquence | Latence tolérée | Perte tolérée | Données |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Messages et accusés** | **Bidirectionnel **<br>- Émission : Client → Serveur<br>- Diffusion : Serveur → Tous les clients | Moyenne à élevée : 10 à 100 messages/min en pointe | Faible à moyenne : 1 à 2 s | **Aucune** : accusé HTTP + ordre séquentiel par ID | Texte (JSON / UTF-8) |
| **2. Présence et saisie** | **Bidirectionnel **<br>- Présence : Serveur → Clients<br>- Saisie : Client → Serveur → Clients | Présence : faible, événementielle.<br>Saisie : haute, rafales de 5 à 10 événements/s, throttlées à 300 ms. | Présence : < 1 s.<br>Saisie : < 50 ms. | Présence : **aucune** (liste exacte).<br>Saisie : **élevée** (seul l'état courant compte). | Texte (JSON / événements légers) |
| **3. Note partagée** | **Bidirectionnel **<br>- Modification : Client → Serveur<br>- Diffusion de version : Serveur → Clients | Moyenne : quelques modifications par minute | Faible à moyenne : 1 à 2 s | **Aucune** : cohérence stricte des versions et détection de conflits | Texte (JSON / version + contenu) |
| **5. Reprise après coupure** | **Bidirectionnel**<br>- Le client renvoie son dernier ID connu (`Last-Event-ID`)<br>- Le serveur rejoue les événements manqués | Ponctuelle : à chaque reconnexion | Moyenne : < 500 ms | **Aucune** : restitution intégrale sans trou ni doublon | Texte (JSON / flux d'événements ordonnés) |

## Étape 2 — Choisir une technologie par besoin

### 1. Messages et accusés de réception
* **Choix :** HTTP POST (émission) + SSE (réception).
* **Pourquoi :** `POST /api/messages` crée le message et renvoie un accusé synchrone (`201` ou `400`). SSE diffuse ensuite le message aux clients sur une connexion HTTP persistante.
* **Limite :** Deux canaux à maintenir ; le client ne doit pas afficher deux fois le message qu'il vient d'envoyer.
* **Statut v0 :** Implémenté en v0. Le client ne rajoute pas le message localement ; il le reçoit par SSE.

### 2. Présence et saisie en cours
* **Choix :** SSE pour les notifications + HTTP POST avec throttle pour la frappe.
* **Pourquoi :** Le serveur pousse les arrivées, départs et états de saisie via SSE. Le client envoie un signal de frappe au maximum toutes les 300 ms.
* **Limite :** Les signaux de frappe génèrent beaucoup de petites requêtes HTTP si le throttle est mal réglé.
* **Statut v0 :** Non implémenté ; prévu plus tard.

### 3. Note partagée
* **Choix :** HTTP POST avec contrôle de version + diffusion SSE.
* **Pourquoi :** Le client envoie sa modification avec la version qu'il connaît. En cas de conflit, le serveur répond `409` avec la version courante ; sinon il diffuse la nouvelle version par SSE.
* **Limite :** Synchronisation par bloc/version, pas édition collaborative caractère par caractère.
* **Statut v0 :** Non implémenté ; prévu plus tard, non implémenté en v0. `clientId` et `version` sont des champs futurs, prévus plus tard, non implémentés en v0.

### 5. Reprise après coupure
* **Choix :** SSE avec `Last-Event-ID` pour la reprise après coupure.
* **Pourquoi :** À la reconnexion, le navigateur renvoie automatiquement le dernier ID reçu. Le serveur rejoue alors les messages manqués depuis cet ID. La v0 implémente ce mécanisme sans logique supplémentaire côté client.
* **Limite :** `Last-Event-ID` ne s'active qu'à une reconnexion. En v0, le premier chargement de la page ne récupère pas l'historique, car il n'y a pas de `GET /api/messages`. Cette route est prévue plus tard, ou en « pour aller plus loin ».

## Étape 3 — Repérer les contraintes des autres besoins

* **Besoin 4 (Authentification & Sécurité) :** `EventSource` ne permet pas d'ajouter un en-tête `Authorization` personnalisé dans le navigateur. Comment authentifier l'ouverture du flux SSE sans exposer le token dans l'URL ?
* **Besoin 6 (Multi-instances & Redis) :** Si Alice est connectée à l'instance A et Bob à l'instance B, comment l'instance A prévient-elle l'instance B qu'un nouveau message doit être poussé dans le SSE de Bob ?
* **Besoin 7 (Tests & Métriques) :** Les flux SSE gardent des connexions HTTP ouvertes. Comment mesurer la mémoire, les sockets et les file descriptors de Node.js lors d'un test de charge avec des centaines d'utilisateurs ?

## Étape 4 — Relire et confronter

### 1. Principales divergences constatées
* **Besoins 1 et 3 (Latence) :** Nous visions initialement moins de 100 ms ; l'autre groupe retient 1 à 2 s pour les messages et 1 à 2 s pour la note.
* **Besoin 2 (Présence) :** L'autre groupe qualifie la perte de présence comme nulle ; nous avions isolé présence et saisie.
* **Besoin 5 (Reprise après coupure) :** Initialement classé Unidirectionnel ; l'autre groupe le classe bidirectionnel, car le client envoie `Last-Event-ID` avant que le serveur rejoue.
* **Données :** L'autre groupe détaille davantage les champs JSON, notamment `clientId` pour les messages et `version` pour la note.

### 2. Décisions retenues après comparaison
1. **Besoin 5 requalifié en bidirectionnel :** le client envoie son dernier ID, le serveur rejoue les événements manqués.
2. **Latence tolérée fixée à 1 à 2 s pour les besoins 1 et 3 :** plus réaliste pour des interactions humaines.
3. **Champs `clientId` et `version` prévus pour les versions futures :** prévu plus tard, non implémenté en v0.

