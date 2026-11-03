import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');
  return port;
}

async function waitForPort(port, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
        socket.once('error', reject);
      });
      return;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Le serveur n'écoute pas sur le port ${port}.`);
}

function makeClient(url, options = {}) {
  const ws = new WebSocket(url, options);
  const messages = [];
  const waiters = [];

  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const closed = new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      message = { raw: data.toString() };
    }

    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index !== -1) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    messages.push(message);
  });

  function next(predicate, timeoutMs = 2000) {
    const index = messages.findIndex(predicate);
    if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
        reject(new Error('Délai dépassé en attendant un message serveur.'));
      }, timeoutMs);
      waiters.push({ predicate, resolve, timer });
    });
  }

  return { ws, opened, closed, next };
}

function hello(client, author = 'Alice') {
  client.ws.send(JSON.stringify({
    v: 1,
    type: 'client.hello',
    payload: { author },
  }));
}

function send(client, text = 'Bonjour') {
  client.ws.send(JSON.stringify({
    v: 1,
    type: 'client.message.send',
    payload: { text },
  }));
}

async function expectError(client, code, action, { closeCode, requestType } = {}) {
  const errorPromise = client.next((message) => (
    message.type === 'server.error' && message.payload.code === code
  ));
  const closePromise = closeCode !== undefined ? client.closed : null;

  action();

  const error = await errorPromise;
  assert.equal(error.v, 1);
  assert.equal(error.type, 'server.error');
  assert.equal(error.payload.fatal, closeCode !== undefined, `fatal incohérent pour ${code}`);
  assert.equal(typeof error.payload.message, 'string', `message manquant pour ${code}`);
  assert.ok(error.payload.message.length > 0, `message vide pour ${code}`);
  if (requestType !== undefined) {
    assert.equal(error.payload.requestType, requestType, `requestType incohérent pour ${code}`);
  }

  if (closePromise) {
    const closed = await closePromise;
    assert.equal(closed.code, closeCode, `code de fermeture incohérent pour ${code}`);
  } else {
    await delay(50);
    assert.equal(client.ws.readyState, WebSocket.OPEN, `${code} ne doit pas fermer la connexion`);
  }
}

async function identify(client, author) {
  const welcomePromise = client.next((message) => message.type === 'server.welcome');
  hello(client, author);
  return welcomePromise;
}

const port = await freePort();
const url = `ws://127.0.0.1:${port}/ws/v1`;
const server = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port),
    WS_PING_INTERVAL_MS: '200',
    WS_IDENTIFY_TIMEOUT_MS: '1500',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.setEncoding('utf8');
server.stderr.setEncoding('utf8');
server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

const clients = [];

try {
  await waitForPort(port);

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'INVALID_JSON', () => client.ws.send('{"v":1'), { closeCode: 1007 });
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'INVALID_ENVELOPE', () => client.ws.send('[]'), { closeCode: 1008 });
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(
      client,
      'UNSUPPORTED_VERSION',
      () => client.ws.send('{"v":2,"type":"client.hello","payload":{"author":"Alice"}}'),
      { closeCode: 4001, requestType: 'client.hello' },
    );
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(
      client,
      'FORBIDDEN_TYPE',
      () => client.ws.send('{"v":1,"type":"server.welcome","payload":{}}'),
      { closeCode: 1008, requestType: 'server.welcome' },
    );
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'BINARY_NOT_SUPPORTED', () => client.ws.send(Buffer.from('{}')), {
      closeCode: 1003,
    });
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(
      client,
      'UNKNOWN_TYPE',
      () => client.ws.send('{"v":1,"type":"client.message.delete","payload":{}}'),
      { requestType: 'client.message.delete' },
    );
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'NOT_IDENTIFIED', () => send(client), {
      requestType: 'client.message.send',
    });
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'INVALID_AUTHOR', () => hello(client, '   '), {
      requestType: 'client.hello',
    });

    const welcome = await identify(client, '  Alice  ');
    assert.equal(welcome.v, 1);
    assert.equal(welcome.type, 'server.welcome');
    assert.equal(welcome.payload.author, 'Alice');
    assert.ok(welcome.payload.clientId);
    assert.ok(!Number.isNaN(Date.parse(welcome.payload.serverTime)));

    await expectError(client, 'ALREADY_IDENTIFIED', () => hello(client, 'Bob'), {
      requestType: 'client.hello',
    });
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await identify(client, 'Alice');

    await expectError(client, 'INVALID_PAYLOAD', () => {
      client.ws.send('{"v":1,"type":"client.message.send","payload":{}}');
    }, { requestType: 'client.message.send' });

    await expectError(client, 'TEXT_TOO_LONG', () => send(client, 'a'.repeat(2001)), {
      requestType: 'client.message.send',
    });

    const createdPromise = client.next((message) => message.type === 'server.message.created');
    send(client, '  Salut  ');
    const created = await createdPromise;
    assert.equal(created.v, 1);
    assert.equal(created.type, 'server.message.created');
    assert.equal(created.payload.author, 'Alice');
    assert.equal(created.payload.text, 'Salut');
    assert.ok(created.payload.id > 0);
    assert.ok(created.payload.clientId);
    assert.ok(!Number.isNaN(Date.parse(created.payload.at)));
  }

  {
    const alice = makeClient(url);
    const bob = makeClient(url);
    clients.push(alice, bob);
    await Promise.all([alice.opened, bob.opened]);
    const [aliceWelcome, bobWelcome] = await Promise.all([identify(alice, 'Alice'), identify(bob, 'Bob')]);
    assert.notEqual(aliceWelcome.payload.clientId, bobWelcome.payload.clientId);

    const aliceCreated = alice.next((message) => (
      message.type === 'server.message.created' && message.payload.text === 'Diffusion'
    ));
    const bobCreated = bob.next((message) => (
      message.type === 'server.message.created' && message.payload.text === 'Diffusion'
    ));

    send(alice, 'Diffusion');

    const [fromAlice, fromBob] = await Promise.all([aliceCreated, bobCreated]);
    assert.deepEqual(fromAlice.payload, fromBob.payload);
    assert.equal(fromAlice.payload.author, 'Alice');
    assert.equal(fromAlice.payload.clientId, aliceWelcome.payload.clientId);
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    const closed = client.closed;
    client.ws.send(JSON.stringify({
      v: 1,
      type: 'client.hello',
      payload: { author: 'A'.repeat(20000) },
    }));
    const event = await closed;
    assert.equal(event.code, 1009);
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await expectError(client, 'IDENTIFICATION_TIMEOUT', () => {}, { closeCode: 4002 });
  }

  {
    const client = makeClient(url, { autoPong: false });
    clients.push(client);
    await client.opened;
    await identify(client, 'Morte');
    const closed = await client.closed;
    assert.equal(closed.code, 1006);
  }

  {
    const client = makeClient(url);
    clients.push(client);
    await client.opened;
    await identify(client, 'Saine');
    await delay(800);
    assert.equal(client.ws.readyState, WebSocket.OPEN);
  }

  console.log('OK: protocole, diffusion et heartbeat vérifiés.');
} finally {
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.close(1000, 'check finished');
  }
  await delay(100);
  const exitPromise = once(server, 'exit');
  server.kill('SIGTERM');
  await Promise.race([
    exitPromise,
    delay(3000).then(() => server.kill('SIGKILL')),
  ]);
}
