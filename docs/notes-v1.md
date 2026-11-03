# Notes v1 — ce qui a été écrit à la main


| Point | Ce qui a été écrit à la main | Transport ou application | Pourquoi |
| :--- | :--- | :--- | :--- |
| Validation de l'enveloppe | Vérification de `v`, `type`, `payload`, ordre des contrôles | Application | WebSocket transporte des octets ; il ne connaît pas le format JSON ni la version du protocole. |
| Parsing JSON | `JSON.parse`, rejet de `INVALID_JSON` et fermeture `1007` | Application | Le transport garantit une trame texte, pas un contenu JSON valide. |
| Aiguillage par type | Table des types connus, `UNKNOWN_TYPE`, `FORBIDDEN_TYPE` | Application | Le transport ne distingue pas `client.hello` de `client.message.send`. |
| Introduction de connexion | `client.hello`, `server.welcome`, délai de 10 s | Application | Le handshake WebSocket ouvre le canal, mais n'identifie pas l'utilisateur. |
| Identité | `author` stocké par connexion, `clientId` UUID | Application | Le transport ne porte aucune notion d'utilisateur. |
| Validation métier | Longueur de `author` et `text`, caractères de contrôle, trim | Application | Ce sont les règles du salon, pas celles de WebSocket. |
| Diffusion | Envoi de `server.message.created` à toutes les connexions identifiées | Application | WebSocket fournit `send` par socket ; la politique de diffusion est applicative. |
| Compteur d'`id` | Entier croissant en mémoire, remis à `1` au redémarrage | Application | Le transport n'attribue aucun identifiant de message. |
| Erreurs applicatives | `server.error`, `code`, `fatal`, `requestType` | Application | Le format d'erreur est défini par le protocole du salon. |
| Codes de fermeture | `1003`, `1007`, `1008`, `1009`, `1011`, `4001`, `4002` | Transport et application | Les codes standards viennent de WebSocket ; `4001` et `4002` sont des codes applicatifs. |
| Heartbeat | Ping/pong, `isAlive`, seuil de suppression | Transport et application | Le ping/pong est fourni par `ws` ; la période, le seuil et le comportement de suppression sont choisis par l'application. |
| États de connexion | `idle`, `connecting`, `open`, `identified`, `closed`, `error` | Transport et application | Les événements viennent du socket ; leur signification pour l'interface est applicative. |
| Reconnexion | Bouton manuel, nouvelle connexion, liste vidée | Application | La v1 ne réimplémente pas la reconnexion automatique d'`EventSource`. |
| Absence d'historique | Aucun rejeu, aucun stockage des messages | Application | C'est une limite volontaire de la v1, à traiter dans une séance ultérieure. |
| Affichage du code de fermeture | `closeCode`, `closeReason` exposés par le composable | Application | Le navigateur fournit l'événement `close`, mais l'interface décide quoi en montrer. |

## Constat pour la séance 5

La v1 montre que la plupart des besoins du salon ne viennent pas du transport : validation, identité, routage des messages, diffusion, erreurs et reprise sont des décisions applicatives. WebSocket apporte le canal bidirectionnel et les trames de contrôle, mais ne remplace ni le protocole métier ni la gestion des états côté client.
