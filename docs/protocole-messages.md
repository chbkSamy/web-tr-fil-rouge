# Protocole WebSocket, v1


## Étape 1 : Inventorier les échanges de la v0

La v0 utilise deux canaux HTTP.

| Échange v0 | Sens | Déclencheur | Contenu |
| :--- | :--- | :--- | :--- |
| `POST /api/messages` | Client → Serveur | L'utilisateur clique sur « Envoyer ». | `{ author, text }` |
| Réponse `201` du POST | Serveur → Client | Le message est accepté. | `{ id, author, text, at }` |
| Réponse `400` du POST | Serveur → Client | `author` ou `text` manque ou est vide après trim. | `{ error }` |
| `GET /api/stream` (SSE) | Serveur → Clients | Un message vient d'être créé. | événement `message` avec `{ id, author, text, at }` |
| En-tête `Last-Event-ID` | Client → Serveur | Reconnexion SSE. | Dernier `id` reçu. |

La v1 remplace tout ça par une seule connexion WebSocket.

| Besoin v0 | Équivalent v1 |
| :--- | :--- |
| `author` envoyé à chaque POST | `author` envoyé une fois dans `client.hello`. Le serveur le garde pour la connexion. |
| `POST /api/messages` | `client.message.send`. Le client n'envoie que `text`. |
| Réponse `201` avec le message créé | `server.message.created`, diffusé à tous les clients identifiés. |
| Événement SSE `message` | `server.message.created`. |
| Réponse `400` | `server.error`. |
| `Last-Event-ID` | Pas encore en v1. `id` est prévu pour ça. |

Pourquoi envoyer `author` une seule fois ? Le serveur garde un état par socket : `{ clientId, author }`. Il ne fait pas confiance à un `author` répété dans chaque message. Du coup, un client ne peut pas se faire passer pour quelqu'un d'autre en changeant le champ. Le prix à payer : l'auteur reste fixe jusqu'à la reconnexion. Pour changer de pseudo, tu rouvres une connexion. C'est le compromis de la v1.

## Étape 2 : Définir l'enveloppe commune

On utilise WebSocket, RFC 6455. Les trames sont du texte UTF-8. Chaque trame contient un objet JSON.

- Dev : `ws://localhost:3000/ws/v1`
- Prod : `wss://<hôte>/ws/v1`
- `maxPayload` : `16384` octets.
- Pas de sous-protocole WebSocket en v1.
- Les trames binaires sont refusées.
- Le ping/pong est géré par `ws`. Ce n'est pas un message applicatif.

Voici l'enveloppe commune.

```json
{
  "v": 1,
  "type": "client.hello",
  "payload": {
    "author": "Alice"
  }
}
```

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `v` | entier | oui | Doit valoir `1` en v1. |
| `type` | chaîne | oui | Format `client.*` ou `server.*`, en minuscules, segments séparés par des points. |
| `payload` | objet | oui | Peut être vide (`{}`). Les champs métier vont dedans. |

Règles :

- `client.*` ne vient que du client. `server.*` ne vient que du serveur.
- Les champs inconnus sont ignorés, dans l'enveloppe comme dans `payload`.
- `payload` est un sous-objet. Quand on ajoutera un champ commun plus tard, les anciens messages ne casseront pas.

## Étape 3 : Lister les types de messages

| Type | Sens | Rôle | Charge utile |
| :--- | :--- | :--- | :--- |
| `client.hello` | Client → Serveur | Déclarer l'identité de la connexion. Premier message applicatif obligatoire. | `author` |
| `server.welcome` | Serveur → Client | Confirmer l'identification et donner un identifiant de connexion. | `clientId`, `author`, `serverTime` |
| `client.message.send` | Client → Serveur | Demander l'envoi d'un message. | `text` |
| `server.message.created` | Serveur → Client | Diffuser un message créé à tous les clients identifiés. | `id`, `clientId`, `author`, `text`, `at` |
| `server.error` | Serveur → Client | Signaler une erreur de protocole ou de validation. | `code`, `message`, `fatal`, `requestType`, `details`, `closeCode` |

## Étape 4 : Préciser les charges utiles

### 4.1 `client.hello`

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `author` | chaîne | oui | Après trim : 1 à 32 points de code Unicode. Aucun caractère de contrôle. |

- L'auteur est stocké une fois pour la connexion. Impossible de le changer sans rouvrir une connexion.
- Un deuxième `client.hello` renvoie `ALREADY_IDENTIFIED`. La connexion reste ouverte.
- Le client attend `server.welcome` avant d'envoyer `client.message.send`. Côté serveur, tout est prêt dès que `client.hello` est reçu.

### 4.2 `server.welcome`

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `clientId` | chaîne | oui | UUID v4 attribué par le serveur, unique par connexion. |
| `author` | chaîne | oui | Auteur normalisé après trim. |
| `serverTime` | chaîne | oui | Date ISO 8601 UTC avec millisecondes. |

- `clientId` identifie la connexion, pas la personne.
- Il change à chaque reconnexion.
- `serverTime` donne l'heure du serveur au client.

### 4.3 `client.message.send`

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `text` | chaîne | oui | Après trim : 1 à 2000 points de code Unicode. Caractères de contrôle U+0000–U+001F et U+007F interdits, sauf `\n` et `\t`. |

- Le client n'envoie pas `author`, `id`, `at` ni `clientId`.
- S'il les envoie quand même, le serveur les ignore et prend l'identité de la connexion.
- Le serveur attribue `id` et `at`.

### 4.4 `server.message.created`

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `id` | entier | oui | Entier positif, strictement croissant, unique pendant la vie du processus serveur. |
| `clientId` | chaîne | oui | Identifiant de la connexion émettrice. |
| `author` | chaîne | oui | Auteur issu de l'identité de la connexion. |
| `text` | chaîne | oui | Texte normalisé après trim. |
| `at` | chaîne | oui | Date ISO 8601 UTC avec millisecondes, générée par le serveur. |

- Diffusion à toutes les connexions identifiées, émetteur compris.
- Le client n'ajoute pas son message localement. Il attend la diffusion. Ça évite les doublons.
- L'ordre est celui du traitement serveur.
- L'`id` strictement croissant servira à la reprise après coupure : un client pourra envoyer son dernier `id` reçu pour demander les messages manqués. La v1 ne l'implémente pas encore.
- `id` repart à `1` après un redémarrage. C'est une limite de la v1.

### 4.5 `server.error`

| Champ | Type JSON | Obligatoire | Contraintes |
| :--- | :--- | :--- | :--- |
| `code` | chaîne | oui | Code machine en majuscules, snake_case. |
| `message` | chaîne | oui | Message lisible en français, 1 à 200 points de code. |
| `fatal` | booléen | oui | `true` si le serveur ferme la connexion après l'erreur. |
| `requestType` | chaîne | non | Type du message fautif, si connu. |
| `details` | objet | non | Détails structurés, par exemple le champ fautif. |
| `closeCode` | entier | non | Obligatoire si `fatal` vaut `true`. Code de fermeture WebSocket. |

### 4.6 Validation et limites

#### 4.6.1 Ordre côté serveur

1. Trame texte obligatoire. Une trame binaire donne `BINARY_NOT_SUPPORTED` et fermeture `1003`.
2. Trame limitée à `maxPayload = 16384` octets. Au-delà, `ws` ferme avec `1009`. Le serveur peut envoyer `MESSAGE_TOO_LARGE` avant la fermeture, mais ce n'est pas garanti.
3. JSON valide obligatoire. Sinon `INVALID_JSON`, `fatal: true`, fermeture `1007`.
4. La racine doit être un objet simple, pas un tableau, pas `null`, pas une chaîne. Sinon `INVALID_ENVELOPE`, `fatal: true`, fermeture `1008`.
5. `v` doit être présent, entier, et valoir `1`. Sinon `UNSUPPORTED_VERSION`, `fatal: true`, fermeture `4001`.
6. `type` doit être une chaîne non vide. Type inconnu : `UNKNOWN_TYPE`, `fatal: false`, connexion ouverte.
7. Un `server.*` envoyé par le client donne `FORBIDDEN_TYPE`, `fatal: true`, fermeture `1008`.
8. `payload` doit être un objet. Sinon `INVALID_ENVELOPE`, `fatal: true`, fermeture `1008`.
9. Connexion non identifiée : seul `client.hello` passe. Un type `client.*` connu autre que `client.hello` donne `NOT_IDENTIFIED`, `fatal: false`. Un type inconnu suit la règle 6. Un `server.*` suit la règle 7.
10. Connexion déjà identifiée : un nouveau `client.hello` donne `ALREADY_IDENTIFIED`, `fatal: false`.
11. Champs de la charge utile validés. Champ manquant, mauvais type ou valeur invalide : `INVALID_PAYLOAD`, `fatal: false`. Exception : `author` dans `client.hello`, voir règle 13.
12. Texte trop long : `TEXT_TOO_LONG`, `fatal: false`.
13. `author` invalide dans `client.hello` (absent, mauvais type, vide après trim, trop long ou avec caractère de contrôle) : `INVALID_AUTHOR`, `fatal: false`.
14. Pas de `client.hello` sous 10 secondes : `IDENTIFICATION_TIMEOUT`, `fatal: true`, fermeture `4002`.

#### 4.6.2 Règles générales

- Le serveur trim `author` et `text` avant validation et diffusion.
- Il ne fait jamais confiance à un `id`, `at`, `author` ou `clientId` fourni dans `client.message.send`.
- Il ne diffuse qu'aux connexions identifiées, émetteur inclus.
- `server.error` part uniquement vers le client qui a envoyé le message fautif. Les autres clients ne reçoivent rien.
- Le client ignore les champs inconnus.
- Le client qui reçoit un `server.*` inconnu l'ignore et garde la connexion.
- Un champ optionnel ajouté plus tard ne doit pas casser un ancien client.

## Étape 5 : Erreurs et codes de fermeture

| Code d'erreur | Cause | `fatal` | Fermeture | Action du client |
| :--- | :--- | :--- | :--- | :--- |
| `INVALID_JSON` | Texte non JSON. | oui | `1007` | Afficher l'erreur, pas de retry auto. |
| `INVALID_ENVELOPE` | Racine non objet, `type` invalide ou `payload` non objet. | oui | `1008` | Corriger le client. |
| `UNSUPPORTED_VERSION` | `v` absent ou différent de `1`. | oui | `4001` | Mettre à jour le client ou signaler l'incompatibilité. |
| `UNKNOWN_TYPE` | Type inconnu. | non | - | Ignorer et continuer. |
| `FORBIDDEN_TYPE` | Le client envoie un `server.*`. | oui | `1008` | Corriger le client. |
| `NOT_IDENTIFIED` | Message avant `client.hello`. | non | - | Envoyer `client.hello`, puis réessayer. |
| `ALREADY_IDENTIFIED` | Deuxième `client.hello`. | non | - | Ignorer, garder l'identité existante. |
| `INVALID_AUTHOR` | `author` absent, mauvais type, vide, trop long ou avec caractère de contrôle dans `client.hello`. | non | - | Corriger et renvoyer `client.hello`. |
| `INVALID_PAYLOAD` | Champ manquant, mauvais type ou valeur invalide (par exemple `text` vide). | non | - | Corriger le message et réessayer. |
| `TEXT_TOO_LONG` | `text` dépasse 2000 points de code. | non | - | Raccourcir. |
| `BINARY_NOT_SUPPORTED` | Trame binaire. | oui | `1003` | Envoyer du texte JSON. |
| `MESSAGE_TOO_LARGE` | Trame au-dessus de `maxPayload`. Erreur best-effort : la fermeture `1009` peut arriver sans `server.error`. | oui | `1009` | Réduire la taille. |
| `IDENTIFICATION_TIMEOUT` | Pas de `client.hello` après 10 s. | oui | `4002` | Se reconnecter et envoyer `client.hello`. |
| `INTERNAL_ERROR` | Erreur serveur inattendue. | oui | `1011` | Afficher l'erreur, reconnexion manuelle. |

Codes standard utilisés : `1000` (normale), `1001` (serveur qui s'arrête), `1002` (erreur WebSocket), `1003` (type non supporté), `1008` (violation de politique), `1009` (message trop gros), `1011` (erreur interne).

Codes applicatifs : `4001` (version non supportée), `4002` (délai d'identification dépassé).

Règles :

- Erreur fatale : le serveur envoie `server.error`, puis ferme avec `closeCode`. Pour `1009` et `1003`, la fermeture peut arriver sans message.
- Erreur non fatale : `server.error`, connexion ouverte.
- En v1, le client ne se reconnecte pas tout seul. Il affiche l'état et laisse l'utilisateur relancer.

## Étape 6 : Versionnage

On met la version majeure dans l'URL (`/ws/v1`) et dans chaque message (`v: 1`). L'URL refuse tôt un client incompatible. Le champ `v` vérifie chaque trame et rend les logs lisibles. Pas de sous-protocole WebSocket en v1. On pourra en ajouter un plus tard.

Tu peux ajouter un champ optionnel, un type de message ou un code d'erreur sans changer de version. En revanche, passer en v2 est obligatoire si tu supprimes ou renommes un champ, si tu changes son type JSON ou son sens, si tu rends obligatoire un champ optionnel, ou si tu changes une règle de validation.

Un client v1 face à un serveur v2 : soit le serveur sert encore `/ws/v1`, soit le handshake échoue, soit il répond `UNSUPPORTED_VERSION` avec `4001`. Un serveur n'accepte jamais une version qu'il ne comprend pas.

## Étape 7 : Exemples et relecture

Chaque bloc montre une trame entière. C'est ce que le client ou le serveur envoie sur le WebSocket, pas juste un morceau de `payload`. J'ai inventé les valeurs. Les types et les contraintes sont ceux du document.

Dans une session normale, le client ouvre la connexion, envoie `client.hello`, reçoit `server.welcome`, puis peut envoyer des messages. Chaque message accepté revient à toutes les connexions identifiées sous forme de `server.message.created`.

### `client.hello`

Le client se présente une seule fois, juste après l'ouverture. Le serveur garde `author` pour toute la connexion.

```json
{
  "v": 1,
  "type": "client.hello",
  "payload": {
    "author": "Alice"
  }
}
```

### `server.welcome`

Le serveur confirme l'identité. Il donne aussi le `clientId` de cette connexion. Ce `clientId` change à chaque reconnexion.

```json
{
  "v": 1,
  "type": "server.welcome",
  "payload": {
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "author": "Alice",
    "serverTime": "2026-10-30T12:00:00.000Z"
  }
}
```

### `client.message.send`

Le client n'envoie que `text`. Pas d'`author`, pas d'`id`, pas d'`at`, pas de `clientId`. S'il ajoute ces champs, le serveur les ignore et prend l'identité de la connexion.

```json
{
  "v": 1,
  "type": "client.message.send",
  "payload": {
    "text": "Salut, tu me reçois ?"
  }
}
```

### `server.message.created`

Le serveur diffuse le message à toutes les connexions identifiées, y compris celle qui l'a envoyé. Le client n'ajoute donc pas son message localement.

```json
{
  "v": 1,
  "type": "server.message.created",
  "payload": {
    "id": 42,
    "clientId": "550e8400-e29b-41d4-a716-446655440000",
    "author": "Alice",
    "text": "Salut, tu me reçois ?",
    "at": "2026-10-30T12:00:01.234Z"
  }
}
```

### `server.error`

Exemple quand `text` manque dans `client.message.send`. L'erreur n'est pas fatale : la connexion reste ouverte.

```json
{
  "v": 1,
  "type": "client.message.send",
  "payload": {}
}
```

Réponse du serveur :

```json
{
  "v": 1,
  "type": "server.error",
  "payload": {
    "code": "INVALID_PAYLOAD",
    "message": "Le champ \"text\" est obligatoire.",
    "fatal": false,
    "requestType": "client.message.send"
  }
}
```

### Cas d'erreur

#### JSON invalide

Le client envoie ce texte, avec une accolade en moins :

```text
{"v":1,"type":"client.hello","payload":{"author":"Alice"}
```

Réponse :

```json
{
  "v": 1,
  "type": "server.error",
  "payload": {
    "code": "INVALID_JSON",
    "message": "La trame n'est pas un JSON valide.",
    "fatal": true,
    "closeCode": 1007
  }
}
```

Le serveur ferme ensuite avec `1007`.

#### Type inconnu

Le type est bien formé, mais le serveur ne le connaît pas. L'erreur n'est pas fatale.

```json
{
  "v": 1,
  "type": "client.message.delete",
  "payload": {}
}
```

Réponse :

```json
{
  "v": 1,
  "type": "server.error",
  "payload": {
    "code": "UNKNOWN_TYPE",
    "message": "Type de message inconnu.",
    "fatal": false,
    "requestType": "client.message.delete"
  }
}
```

La connexion reste ouverte.

#### Message avant `client.hello`

Le client tente d'envoyer un message sans s'être identifié.

```json
{
  "v": 1,
  "type": "client.message.send",
  "payload": {
    "text": "Bonjour"
  }
}
```

Réponse :

```json
{
  "v": 1,
  "type": "server.error",
  "payload": {
    "code": "NOT_IDENTIFIED",
    "message": "Envoie client.hello avant tout autre message.",
    "fatal": false,
    "requestType": "client.message.send"
  }
}
```

Le client peut envoyer `client.hello`, puis réessayer.

#### Version inconnue

Le client demande la version 2. Le serveur ne la comprend pas.

```json
{
  "v": 2,
  "type": "client.hello",
  "payload": {
    "author": "Alice"
  }
}
```

Réponse :

```json
{
  "v": 1,
  "type": "server.error",
  "payload": {
    "code": "UNSUPPORTED_VERSION",
    "message": "Version non supportée. Cette connexion attend la version 1.",
    "fatal": true,
    "requestType": "client.hello",
    "closeCode": 4001
  }
}
```

Le serveur ferme ensuite avec `4001`.



