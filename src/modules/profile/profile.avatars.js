const path = require('node:path');
const config = require('../../config');

const PRESET_LABELS = [
  'Amber',
  'Basil',
  'Cedar',
  'Dune',
  'Ember',
  'Fern',
  'Grove',
  'Harbor',
  'Iris',
  'Juniper',
  'Kelp',
  'Lark',
];

const PRESETS = PRESET_LABELS.map((label, index) => {
  const key = `preset-${String(index + 1).padStart(2, '0')}`;
  return {
    key,
    label,
    url: `/images/avatars/${key}.svg`,
  };
});

const PRESET_KEYS = new Set(PRESETS.map((preset) => preset.key));

const MIME_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
});

const UPLOAD_FILENAME_PATTERN = /^\d+-\d+\.(png|jpg|webp)$/;
const UPLOAD_CONTENT_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
});

function isPresetKey(value) {
  return typeof value === 'string' && PRESET_KEYS.has(value);
}

function findPreset(value) {
  return PRESETS.find((preset) => preset.key === value) || null;
}

function randomPresetKey(excludeKey) {
  const candidates = PRESETS.filter((preset) => preset.key !== excludeKey);
  const pool = candidates.length > 0 ? candidates : PRESETS;
  return pool[Math.floor(Math.random() * pool.length)].key;
}

function presetPath(value) {
  if (!isPresetKey(value)) {
    return null;
  }
  return path.join(config.projectRoot, 'public', 'images', 'avatars', `${value}.svg`);
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  if (
    buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

function extensionForMime(mimeType) {
  return MIME_EXTENSIONS[mimeType] || null;
}

function isUploadFilename(value) {
  return typeof value === 'string' && UPLOAD_FILENAME_PATTERN.test(value);
}

function uploadContentType(value) {
  if (!isUploadFilename(value)) {
    return null;
  }
  const extension = value.split('.').pop();
  return UPLOAD_CONTENT_TYPES[extension] || null;
}

function uploadPath(value) {
  if (!isUploadFilename(value)) {
    return null;
  }
  return path.join(config.avatarUploadDir, value);
}

module.exports = {
  PRESETS,
  isPresetKey,
  findPreset,
  randomPresetKey,
  presetPath,
  detectImageType,
  extensionForMime,
  isUploadFilename,
  uploadContentType,
  uploadPath,
};
