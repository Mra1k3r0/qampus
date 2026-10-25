const express = require('express');
const displayService = require('./display.service');
const { relativeUpdatedLabel } = require('../../core/time');

function createDisplayRouter({ db }) {
  const router = express.Router();

  router.get('/display', (_req, res) => {
    const board = displayService.getBoard(db);
    res.set('Cache-Control', 'no-store, max-age=0');
    res.render('pages/display', {
      title: 'Now serving',
      layout: false,
      board,
      updatedLabel: relativeUpdatedLabel(board.updatedAt),
    });
  });

  router.get('/api/display', (_req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json(displayService.getBoard(db));
  });

  return router;
}

module.exports = {
  createDisplayRouter,
};
