const queueService = require('../queue/queue.service');

function getBoard(db, date) {
  return queueService.getDisplayBoard(db, date);
}

module.exports = {
  getBoard,
};
