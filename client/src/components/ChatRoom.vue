<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useChat } from '../composables/useChat.js';

const {
  messages,
  status,
  statusLabel,
  init,
  sendMessage,
  disconnectSSE,
} = useChat();

const author = ref('');
const text = ref('');
const sendError = ref('');
const isSending = ref(false);
const messagesEl = ref(null);

async function scrollToBottom() {
  await nextTick();
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }
}

async function handleSendMessage() {
  const authorValue = author.value.trim();
  const content = text.value.trim();
  if (!authorValue || !content) return;

  isSending.value = true;
  sendError.value = '';
  try {
    await sendMessage(authorValue, content);
    text.value = '';
  } catch (err) {
    sendError.value = err.message;
  } finally {
    isSending.value = false;
  }
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSendMessage();
  }
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => {
  init(scrollToBottom);
});

onUnmounted(() => {
  disconnectSSE();
});
</script>

<template>
  <div class="chat-container">
    <div class="salon-wrapper">
      <header class="header">
        <div class="header-title">
          <h1>Salon temps réel</h1>
          <span class="version-tag">v0</span>
        </div>

        <div id="connection-status" class="status-indicator" :class="status">
          <span class="status-dot"></span>
          <span>{{ statusLabel }}</span>
        </div>
      </header>

      <main ref="messagesEl" id="messages-list" class="messages-list" aria-live="polite">
        <div v-if="messages.length === 0" class="empty-state">
          Aucun message pour l'instant.
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
        <p v-if="sendError" class="error-text" role="alert">
          {{ sendError }}
        </p>

        <div class="composer-row">
          <input
            id="input-author"
            v-model="author"
            type="text"
            class="input composer-author"
            placeholder="Auteur"
            autocomplete="off"
            :disabled="isSending"
          />

          <input
            id="input-text"
            v-model="text"
            type="text"
            class="input composer-input"
            placeholder="Message..."
            :disabled="isSending"
            @keydown="onKeydown"
          />

          <button
            id="btn-send"
            class="btn btn-primary"
            :disabled="isSending || !author.trim() || !text.trim()"
            @click="handleSendMessage"
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

.status-indicator.connecting { color: #f59e0b; }
.status-indicator.connecting .status-dot { background: #f59e0b; }
.status-indicator.open { color: #10b981; }
.status-indicator.open .status-dot { background: #10b981; }
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: #ef4444;
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
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
