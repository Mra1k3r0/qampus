const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

function loadIcons() {
  const iconPath = path.join(config.projectRoot, 'public', 'icons', 'lucide.json');
  try {
    const raw = fs.readFileSync(iconPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function setFlash(req, type, message) {
  if (!req.flash) {
    return;
  }
  req.flash(type, message);
}

function takeFlash(req) {
  if (!req.flash) {
    return null;
  }

  const messages = req.flash();
  const type = Object.keys(messages)[0];
  if (!type) {
    return null;
  }

  return { type, message: messages[type][0] };
}

function createContext({ appName, icons = loadIcons() }) {
  return function context(req, res, next) {
    res.locals.appName = appName;
    res.locals.user = req.user || null;
    res.locals.flash = takeFlash(req);
    res.locals.currentPath = req.path;
    res.locals.requestId = req.id || null;
    res.locals.icons = icons;
    next();
  };
}

module.exports = {
  createContext,
  loadIcons,
  setFlash,
  takeFlash,
};
