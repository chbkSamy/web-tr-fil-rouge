import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  IDENTIFY_TIMEOUT_MS,
  MAX_PAYLOAD,
  PING_INTERVAL_MS,
  PORT,
  WS_PATH,
} from './config.js';
import { PROTOCOL_VERSION, validateMessage } from './protocol.js';

let nextId = 1;
const connections = new Map();

const httpServer = createServer((req, res) => {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({
  server: httpServer,
  path: WS_PATH,
  maxPayload: MAX_PAYLOAD,
});

wss.on('error', (error) => {
  console.error(`[ws] erreur serveur: ${error.message}`);
});

function sendEnvelope(ws, type, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type, payload }));
    return true;
  } catch {
    return false;
  }
}

function sendError(ws, error) {
  sendEnvelope(ws, 'server.error', error);
  if (error.fatal) {
    try {
      ws.close(error.closeCode ?? 1011, error.code);
    } catch {
      ws.terminate();
    }
  }
}

function cleanup(ws) {
  const state = connections.get(ws);
  if (!state) return;
  clearTimeout(state.identifyTimer);
  connections.delete(ws);
  console.log(`[ws] déconnexion clientId=${state.clientId ?? '-'} total=${connections.size}`);
}

function broadcast(message) {
  for (const [ws, state] of connections) {
    if (!state.clientId || ws.readyState !== WebSocket.OPEN) continue;
    try {
      ws.send(JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'server.message.created',
        payload: message,
      }));
    } catch {
      ws.terminate();
      cleanup(ws);
    }
  }
}

wss.on('connection', (ws) => {
  const state = {
    clientId: null,
    author: null,
    isAlive: true,
    identifyTimer: setTimeout(() => {
      sendError(ws, {
        code: 'IDENTIFICATION_TIMEOUT',
        message: `Aucun client.hello reçu dans les ${IDENTIFY_TIMEOUT_MS / 1000} secondes.`,
        fatal: true,
        closeCode: 4002,
      });
    }, IDENTIFY_TIMEOUT_MS),
  };
  connections.set(ws, state);
  console.log(`[ws] connexion total=${connections.size}`);

  ws.on('pong', () => {
    state.isAlive = true;
  });

  ws.on('error', (error) => {
    console.error(`[ws] erreur socket: ${error.message}`);
    if (error.message.includes('Max payload size exceeded')) {
      sendError(ws, {
        code: 'MESSAGE_TOO_LARGE',
        message: 'La trame dépasse la taille maximale autorisée.',
        fatal: true,
        closeCode: 1009,
      });
    }
  });

  ws.on('close', () => cleanup(ws));

  ws.on('message', (data, isBinary) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      if (isBinary) {
        sendError(ws, {
          code: 'BINARY_NOT_SUPPORTED',
          message: 'Les trames binaires ne sont pas supportées. Envoie du texte JSON.',
          fatal: true,
          closeCode: 1003,
        });
        return;
      }

      const result = validateMessage(data.toString('utf8'), state.clientId !== null);
      if (!result.ok) {
        sendError(ws, result.error);
        return;
      }

      if (result.type === 'client.hello') {
        state.clientId = randomUUID();
        state.author = result.payload.author;
        clearTimeout(state.identifyTimer);
        state.identifyTimer = null;

        sendEnvelope(ws, 'server.welcome', {
          clientId: state.clientId,
          author: state.author,
          serverTime: new Date().toISOString(),
        });
        return;
      }

      const message = {
        id: nextId++,
        clientId: state.clientId,
        author: state.author,
        text: result.payload.text,
        at: new Date().toISOString(),
      };
      broadcast(message);
    } catch (error) {
      console.error(`[ws] erreur interne: ${error.message}`);
      sendError(ws, {
        code: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur.',
        fatal: true,
        closeCode: 1011,
      });
    }
  });
});

const heartbeat = setInterval(() => {
  for (const [ws, state] of connections) {
    if (ws.readyState !== WebSocket.OPEN) {
      cleanup(ws);
      continue;
    }
    if (!state.isAlive) {
      console.log(`[ws] heartbeat: connexion morte clientId=${state.clientId ?? '-'}`);
      ws.terminate();
      cleanup(ws);
      continue;
    }
    state.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
      cleanup(ws);
    }
  }
}, PING_INTERVAL_MS);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  for (const [ws] of connections) {
    try {
      ws.close(1001, 'server shutdown');
    } catch {
      ws.terminate();
    }
  }
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(PORT, () => {
  console.log(`Serveur WebSocket démarré sur ws://localhost:${PORT}${WS_PATH}`);
});
