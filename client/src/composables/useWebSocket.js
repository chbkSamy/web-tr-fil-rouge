import { ref } from 'vue';

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/v1`;
}

export function useWebSocket() {
  const messages = ref([]);
  const status = ref('idle');
  const author = ref('');
  const closeCode = ref(null);
  const closeReason = ref('');
  const errorMessage = ref('');

  let socket = null;

  function handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      errorMessage.value = 'Réponse serveur illisible.';
      return;
    }

    if (message.v !== 1) return;

    switch (message.type) {
      case 'server.welcome':
        author.value = message.payload.author;
        status.value = 'identified';
        errorMessage.value = '';
        break;
      case 'server.message.created':
        messages.value.push(message.payload);
        break;
      case 'server.error':
        errorMessage.value = message.payload.message;
        break;
      default:
        break;
    }
  }

  function connect(name) {
    const requestedAuthor = name.trim();
    if (!requestedAuthor) return;

    disconnect();

    messages.value = [];
    author.value = '';
    closeCode.value = null;
    closeReason.value = '';
    errorMessage.value = '';
    status.value = 'connecting';

    const ws = new WebSocket(socketUrl());
    socket = ws;

    ws.addEventListener('open', () => {
      if (socket !== ws) return;
      status.value = 'open';
      ws.send(JSON.stringify({
        v: 1,
        type: 'client.hello',
        payload: { author: requestedAuthor },
      }));
    });

    ws.addEventListener('message', (event) => {
      if (socket !== ws) return;
      handleMessage(event);
    });

    ws.addEventListener('close', (event) => {
      if (socket !== ws) return;
      socket = null;
      author.value = '';
      closeCode.value = event.code;
      closeReason.value = event.reason;
      status.value = 'closed';
    });

    ws.addEventListener('error', () => {
      if (socket !== ws) return;
      if (!errorMessage.value) errorMessage.value = 'Erreur de connexion.';
      status.value = 'error';
    });
  }

  function disconnect() {
    const ws = socket;
    socket = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close(1000, 'client disconnect');
      } catch {
        ws.close();
      }
    }
    status.value = 'idle';
    author.value = '';
  }

  function sendMessage(text) {
    const content = text.trim();
    if (!content || status.value !== 'identified' || !socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({
      v: 1,
      type: 'client.message.send',
      payload: { text: content },
    }));
    return true;
  }

  return {
    messages,
    status,
    author,
    closeCode,
    closeReason,
    errorMessage,
    connect,
    disconnect,
    sendMessage,
  };
}
