function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function setPending(req, pending) {
  req.session.pending = {
    userId: pending.userId,
    email: pending.email,
  };
}

function clearPending(req) {
  delete req.session.pending;
}

function setReset(req, reset) {
  req.session.reset = {
    userId: reset.userId,
    verifiedAt: reset.verifiedAt,
    expiresAt: reset.expiresAt,
  };
}

function clearReset(req) {
  delete req.session.reset;
}

module.exports = {
  regenerateSession,
  saveSession,
  destroySession,
  setPending,
  clearPending,
  setReset,
  clearReset,
};
