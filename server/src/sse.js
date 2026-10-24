export class SseHub {
  constructor() {
    this.clients = new Set();
  }

  register(req, res, replayMessages = []) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for (const message of replayMessages) {
      this.sendEvent(res, message);
    }

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });
  }

  sendEvent(res, message) {
    res.write(`id: ${message.id}\n`);
    res.write('event: message\n');
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  broadcast(message) {
    for (const client of this.clients) {
      try {
        this.sendEvent(client, message);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const sseHub = new SseHub();
