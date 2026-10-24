import { ref, reactive, computed } from 'vue';

export function useChat() {
  const messages = reactive([]);
  const status = ref('connecting');

  let eventSource = null;

  function connectSSE(onMessageReceived) {
    disconnectSSE();
    status.value = 'connecting';
    eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('open', () => {
      status.value = 'open';
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        messages.push(message);
        if (onMessageReceived) onMessageReceived();
      } catch {
        console.error('[useChat] Message SSE non parsable', event.data);
      }
    });

    eventSource.addEventListener('error', () => {
      status.value = 'error';
    });
  }

  function disconnectSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function init(onMessageReceived) {
    connectSSE(onMessageReceived);
  }

  async function sendMessage(author, text) {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, text }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur ${res.status}`);
    }
  }

  const statusLabel = computed(() => {
    switch (status.value) {
      case 'open': return 'En ligne';
      case 'error': return 'Déconnecté';
      default: return 'Connexion...';
    }
  });

  return {
    messages,
    status,
    statusLabel,
    init,
    sendMessage,
    disconnectSSE,
  };
}
