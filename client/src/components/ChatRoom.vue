<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useWebSocket } from '../composables/useWebSocket.js';

const {
  messages,
  status,
  author,
  closeCode,
  closeReason,
  errorMessage,
  connect,
  disconnect,
  sendMessage,
} = useWebSocket();

const authorInput = ref('');
const text = ref('');
const messagesEl = ref(null);

const isBusy = computed(() => status.value === 'connecting');
const isIdentified = computed(() => status.value === 'identified');
const canConnect = computed(() => authorInput.value.trim().length > 0);
const canSend = computed(() => isIdentified.value && text.value.trim().length > 0);
const statusClass = computed(() => (status.value === 'closed' ? 'error' : status.value));

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connecting':
      return 'Connexion...';
    case 'open':
      return 'Identification...';
    case 'identified':
      return `En ligne (${author.value})`;
    case 'closed':
      return closeCode.value === 1000 ? 'Déconnecté' : `Déconnecté (${closeCode.value})`;
    case 'error':
      return 'Erreur de connexion';
    default:
      return 'Hors ligne';
  }
});

async function scrollToBottom() {
  await nextTick();
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }
}

function handleConnect() {
  if (!canConnect.value) return;
  connect(authorInput.value);
}

function handleSend() {
  if (!canSend.value) return;
  if (sendMessage(text.value)) text.value = '';
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

watch(() => messages.value.length, scrollToBottom);

onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <div class="chat-container">
    <div class="salon-wrapper">
      <header class="header">
        <div class="header-title">
          <h1>Salon temps réel</h1>
          <span class="version-tag">v1</span>
        </div>

        <div id="connection-status" class="status-indicator" :class="statusClass">
          <span class="status-dot"></span>
          <span>{{ statusLabel }}</span>
        </div>
      </header>

      <main ref="messagesEl" id="messages-list" class="messages-list" aria-live="polite">
        <div v-if="messages.length === 0" class="empty-state">
          {{ isIdentified ? 'Aucun message pour l’instant.' : 'Connecte-toi pour discuter.' }}
        </div>

        <article
          v-for="msg in messages"
          :key="msg.id"
          class="message-card"
        >
          <div class="message-meta">
            <span class="message-author">{{ msg.author }}</span>
            <time class="message-time" :datetime="msg.at">{{ formatTime(msg.at) }}</time>
          </div>
          <p class="message-text">{{ msg.text }}</p>
        </article>
      </main>

      <footer class="composer">
        <p v-if="errorMessage" class="error-text" role="alert">
          {{ errorMessage }}
        </p>

        <p v-if="status === 'closed'" class="connection-detail">
          Code de fermeture : {{ closeCode }}
          <span v-if="closeReason"> — {{ closeReason }}</span>
        </p>

        <div class="composer-row">
          <input
            id="input-author"
            v-model="authorInput"
            type="text"
            class="input composer-author"
            placeholder="Auteur"
            autocomplete="off"
            maxlength="32"
            :disabled="isIdentified || isBusy"
            @keydown.enter.prevent="handleConnect"
          />

          <button
            v-if="isIdentified"
            id="btn-disconnect"
            class="btn btn-secondary"
            @click="disconnect"
          >
            Se déconnecter
          </button>
          <button
            v-else
            id="btn-connect"
            class="btn btn-primary"
            :disabled="!canConnect || isBusy"
            @click="handleConnect"
          >
            {{ isBusy ? 'Connexion...' : 'Se connecter' }}
          </button>
        </div>

        <div class="composer-row">
          <input
            id="input-text"
            v-model="text"
            type="text"
            class="input composer-input"
            placeholder="Message..."
            :disabled="!isIdentified"
            @keydown="onKeydown"
          />

          <button
            id="btn-send"
            class="btn btn-primary"
            :disabled="!canSend"
            @click="handleSend"
          >
            Envoyer
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.salon-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #1a1d27;
  border: 1px solid #2e3346;
  border-radius: 8px;
  font-size: 0.85rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-title h1 {
  font-size: 1rem;
  font-weight: 600;
}

.version-tag {
  font-size: 0.7rem;
  color: #94a3b8;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.idle { color: #94a3b8; }
.status-indicator.idle .status-dot { background: #94a3b8; }
.status-indicator.connecting { color: #f59e0b; }
.status-indicator.connecting .status-dot { background: #f59e0b; }
.status-indicator.open { color: #f59e0b; }
.status-indicator.open .status-dot { background: #f59e0b; }
.status-indicator.identified { color: #10b981; }
.status-indicator.identified .status-dot { background: #10b981; }
.status-indicator.error { color: #ef4444; }
.status-indicator.error .status-dot { background: #ef4444; }

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: #1a1d27;
  border: 1px solid #2e3346;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty-state {
  margin: auto;
  color: #64748b;
  font-size: 0.9rem;
}

.message-card {
  padding: 0.5rem 0.75rem;
  background: #222634;
  border-radius: 6px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}

.message-author {
  font-weight: 600;
  font-size: 0.8rem;
  color: #818cf8;
}

.message-time {
  font-size: 0.7rem;
  color: #64748b;
}

.message-text {
  font-size: 0.9rem;
  color: #f1f5f9;
  word-break: break-word;
}

.composer {
  padding: 0.75rem 1rem;
  background: #1a1d27;
  border: 1px solid #2e3346;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.composer-row {
  display: flex;
  gap: 0.5rem;
}

.input {
  background: #222634;
  border: 1px solid #2e3346;
  border-radius: 6px;
  color: #f1f5f9;
  padding: 0.5rem 0.75rem;
  outline: none;
}
.input:focus {
  border-color: #6366f1;
}
.input:disabled {
  opacity: 0.6;
}

.composer-author {
  flex: 0 0 140px;
}

.composer-input {
  flex: 1;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary {
  background: #6366f1;
  color: #ffffff;
}

.btn-secondary {
  background: #334155;
  color: #e2e8f0;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: #ef4444;
  font-size: 0.8rem;
}

.connection-detail {
  color: #94a3b8;
  font-size: 0.75rem;
}

@media (max-width: 600px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .composer-row {
    flex-direction: column;
  }

  .composer-author {
    flex: 1;
  }
}
</style>
