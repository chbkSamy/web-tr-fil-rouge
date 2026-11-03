import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessage } from '../src/protocol.js';

const hello = (author = 'Alice') => JSON.stringify({
  v: 1,
  type: 'client.hello',
  payload: { author },
});

const send = (text = 'Bonjour') => JSON.stringify({
  v: 1,
  type: 'client.message.send',
  payload: { text },
});

function expectError(result, code, { fatal = false, closeCode } = {}) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(result.error.fatal, fatal);
  if (closeCode !== undefined) assert.equal(result.error.closeCode, closeCode);
}

test('accepte client.hello et normalise author', () => {
  const result = validateMessage(hello('  Alice  '));
  assert.deepEqual(result, { ok: true, type: 'client.hello', payload: { author: 'Alice' } });
});

test('refuse un JSON invalide', () => {
  expectError(validateMessage('{"v":1'), 'INVALID_JSON', { fatal: true, closeCode: 1007 });
});

test('refuse une racine non objet', () => {
  expectError(validateMessage('[]'), 'INVALID_ENVELOPE', { fatal: true, closeCode: 1008 });
});

test('refuse une version absente ou différente', () => {
  expectError(validateMessage('{"type":"client.hello","payload":{}}'), 'UNSUPPORTED_VERSION', {
    fatal: true,
    closeCode: 4001,
  });
  expectError(validateMessage('{"v":2,"type":"client.hello","payload":{"author":"Alice"}}'), 'UNSUPPORTED_VERSION', {
    fatal: true,
    closeCode: 4001,
  });
});

test('refuse un type absent ou non chaîne', () => {
  expectError(validateMessage('{"v":1,"payload":{}}'), 'INVALID_ENVELOPE', {
    fatal: true,
    closeCode: 1008,
  });
  expectError(validateMessage('{"v":1,"type":42,"payload":{}}'), 'INVALID_ENVELOPE', {
    fatal: true,
    closeCode: 1008,
  });
});

test('refuse tous les types server.* avant de chercher un type connu', () => {
  expectError(validateMessage('{"v":1,"type":"server.inconnu","payload":{}}'), 'FORBIDDEN_TYPE', {
    fatal: true,
    closeCode: 1008,
  });
  expectError(validateMessage('{"v":1,"type":"server.welcome","payload":{}}'), 'FORBIDDEN_TYPE', {
    fatal: true,
    closeCode: 1008,
  });
});

test('signale un type inconnu sans fermer', () => {
  expectError(validateMessage('{"v":1,"type":"client.message.delete","payload":{}}'), 'UNKNOWN_TYPE');
});

test('un type inconnu reste UNKNOWN_TYPE avant identification', () => {
  expectError(validateMessage('{"v":1,"type":"client.inconnu","payload":{}}', false), 'UNKNOWN_TYPE');
});

test('refuse un payload non objet', () => {
  expectError(validateMessage('{"v":1,"type":"client.hello","payload":"Alice"}'), 'INVALID_ENVELOPE', {
    fatal: true,
    closeCode: 1008,
  });
});

test('refuse un message avant identification', () => {
  expectError(validateMessage(send(), false), 'NOT_IDENTIFIED');
});

test('refuse un deuxième hello', () => {
  expectError(validateMessage(hello('Bob'), true), 'ALREADY_IDENTIFIED');
});

test('refuse un author absent, vide, trop long ou avec caractère de contrôle', () => {
  expectError(validateMessage('{"v":1,"type":"client.hello","payload":{}}'), 'INVALID_AUTHOR');
  expectError(validateMessage(hello('   ')), 'INVALID_AUTHOR');
  expectError(validateMessage(hello('a'.repeat(33))), 'INVALID_AUTHOR');
  expectError(validateMessage(hello('Ali\nce')), 'INVALID_AUTHOR');
});

test('accepte un author de 32 points de code', () => {
  const result = validateMessage(hello('é'.repeat(32)));
  assert.equal(result.ok, true);
  assert.equal(result.payload.author, 'é'.repeat(32));
});

test('refuse un text absent, vide ou avec caractère de contrôle', () => {
  expectError(validateMessage('{"v":1,"type":"client.message.send","payload":{}}', true), 'INVALID_PAYLOAD');
  expectError(validateMessage(send('   '), true), 'INVALID_PAYLOAD');
  expectError(validateMessage(send('Bonjour\u0000'), true), 'INVALID_PAYLOAD');
  expectError(validateMessage(send('Bonjour\rLigne'), true), 'INVALID_PAYLOAD');
});

test('refuse un text trop long', () => {
  expectError(validateMessage(send('a'.repeat(2001)), true), 'TEXT_TOO_LONG');
});

test('accepte un text de 2000 points de code', () => {
  const result = validateMessage(send('é'.repeat(2000)), true);
  assert.equal(result.ok, true);
  assert.equal(result.payload.text, 'é'.repeat(2000));
});

test('accepte les retours à la ligne et tabulations dans text', () => {
  const result = validateMessage(send('Ligne 1\nLigne 2\tok'), true);
  assert.equal(result.ok, true);
  assert.equal(result.payload.text, 'Ligne 1\nLigne 2\tok');
});

test('nettoie text avant validation et diffusion', () => {
  const result = validateMessage(send('  Bonjour  '), true);
  assert.deepEqual(result, {
    ok: true,
    type: 'client.message.send',
    payload: { text: 'Bonjour' },
  });
});
