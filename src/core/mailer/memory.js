function createMemoryMailer() {
  const messages = [];
  let nextId = 1;

  return {
    messages,
    async send(message) {
      const id = `memory-${nextId}`;
      nextId += 1;
      messages.push({ ...message, id });
      return { id };
    },
  };
}

module.exports = {
  createMemoryMailer,
};
