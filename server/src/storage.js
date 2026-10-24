export class MessageRepository {
  constructor() {
    this.messages = [];
    this.nextId = 1;
  }

  getSince(lastId) {
    return this.messages.filter((message) => message.id > lastId);
  }

  create({ author, text }) {
    const message = {
      id: this.nextId++,
      author,
      text,
      at: new Date().toISOString(),
    };
    this.messages.push(message);
    return message;
  }
}

export const messageRepo = new MessageRepository();
