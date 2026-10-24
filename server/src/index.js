import express from 'express';
import { PORT } from './config.js';
import { messageRepo } from './storage.js';
import { sseHub } from './sse.js';

const app = express();

app.use(express.json());

app.post('/api/messages', (req, res) => {
  const author = typeof req.body?.author === 'string' ? req.body.author.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

  if (!author) {
    return res.status(400).json({ error: 'Le champ "author" est requis.' });
  }
  if (!text) {
    return res.status(400).json({ error: 'Le champ "text" est requis.' });
  }

  const message = messageRepo.create({ author, text });
  sseHub.broadcast(message);

  res.status(201).json(message);
});

app.get('/api/stream', (req, res) => {
  const rawId = req.headers['last-event-id'];
  const lastId = rawId ? Number(rawId) : NaN;
  const replay = Number.isInteger(lastId) ? messageRepo.getSince(lastId) : [];

  sseHub.register(req, res, replay);
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
