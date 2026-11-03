export const PROTOCOL_VERSION = 1;
export const MAX_AUTHOR_CODE_POINTS = 32;
export const MAX_TEXT_CODE_POINTS = 2000;

const KNOWN_TYPES = new Set(['client.hello', 'client.message.send']);
const AUTHOR_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message, { fatal = false, closeCode, requestType } = {}) {
  const error = { code, message, fatal };
  if (requestType !== undefined) error.requestType = requestType;
  if (closeCode !== undefined) error.closeCode = closeCode;
  return { ok: false, error };
}

function codePointLength(value) {
  return [...value].length;
}

function validateAuthor(raw) {
  if (typeof raw !== 'string') {
    return fail('INVALID_AUTHOR', 'Le champ "author" est obligatoire.');
  }

  const author = raw.trim();
  if (author.length === 0) {
    return fail('INVALID_AUTHOR', 'Le champ "author" ne peut pas être vide.');
  }
  if (codePointLength(author) > MAX_AUTHOR_CODE_POINTS) {
    return fail('INVALID_AUTHOR', `Le champ "author" dépasse ${MAX_AUTHOR_CODE_POINTS} caractères.`);
  }
  if (AUTHOR_CONTROL_CHARS.test(author)) {
    return fail('INVALID_AUTHOR', 'Le champ "author" contient un caractère de contrôle interdit.');
  }

  return { ok: true, value: author };
}

function validateText(raw) {
  if (typeof raw !== 'string') {
    return fail('INVALID_PAYLOAD', 'Le champ "text" est obligatoire.');
  }

  const text = raw.trim();
  if (text.length === 0) {
    return fail('INVALID_PAYLOAD', 'Le champ "text" ne peut pas être vide.');
  }
  if (codePointLength(text) > MAX_TEXT_CODE_POINTS) {
    return fail('TEXT_TOO_LONG', `Le champ "text" dépasse ${MAX_TEXT_CODE_POINTS} caractères.`);
  }
  if (TEXT_CONTROL_CHARS.test(text)) {
    return fail('INVALID_PAYLOAD', 'Le champ "text" contient un caractère de contrôle interdit.');
  }

  return { ok: true, value: text };
}

function parseEnvelope(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail('INVALID_JSON', "La trame n'est pas un JSON valide.", {
      fatal: true,
      closeCode: 1007,
    });
  }

  if (!isPlainObject(value)) {
    return fail('INVALID_ENVELOPE', "L'enveloppe doit être un objet JSON.", {
      fatal: true,
      closeCode: 1008,
    });
  }

  const requestType = typeof value.type === 'string' ? value.type : undefined;

  if (value.v !== PROTOCOL_VERSION) {
    return fail('UNSUPPORTED_VERSION', `Version non supportée. Cette connexion attend la version ${PROTOCOL_VERSION}.`, {
      fatal: true,
      closeCode: 4001,
      requestType,
    });
  }

  if (typeof value.type !== 'string' || value.type.length === 0) {
    return fail('INVALID_ENVELOPE', 'Le champ "type" est obligatoire et doit être une chaîne non vide.', {
      fatal: true,
      closeCode: 1008,
    });
  }

  if (value.type.startsWith('server.')) {
    return fail('FORBIDDEN_TYPE', "Un client ne peut pas envoyer un message de type server.*.", {
      fatal: true,
      closeCode: 1008,
      requestType: value.type,
    });
  }

  if (!KNOWN_TYPES.has(value.type)) {
    return fail('UNKNOWN_TYPE', 'Type de message inconnu.', {
      requestType: value.type,
    });
  }

  if (!isPlainObject(value.payload)) {
    return fail('INVALID_ENVELOPE', 'Le champ "payload" doit être un objet.', {
      fatal: true,
      closeCode: 1008,
      requestType: value.type,
    });
  }

  return { ok: true, type: value.type, payload: value.payload };
}

function attachRequestType(result, requestType) {
  if (!result.ok) result.error.requestType = requestType;
  return result;
}

export function validateMessage(raw, identified = false) {
  const envelope = parseEnvelope(raw);
  if (!envelope.ok) return envelope;

  const { type, payload } = envelope;

  if (type === 'client.hello') {
    if (identified) {
      return fail('ALREADY_IDENTIFIED', 'La connexion est déjà identifiée.', {
        requestType: type,
      });
    }

    const author = attachRequestType(validateAuthor(payload.author), type);
    if (!author.ok) return author;

    return { ok: true, type, payload: { author: author.value } };
  }

  if (!identified) {
    return fail('NOT_IDENTIFIED', 'Envoie client.hello avant tout autre message.', {
      requestType: type,
    });
  }

  const text = attachRequestType(validateText(payload.text), type);
  if (!text.ok) return text;

  return { ok: true, type, payload: { text: text.value } };
}
