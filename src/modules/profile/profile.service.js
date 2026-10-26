const fs = require('node:fs');
const path = require('node:path');
const createError = require('http-errors');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { nowIso } = require('../../core/time');
const {
  avatarUrl,
  initials,
  memberSinceLabel,
  roleLabel,
} = require('../../core/user-view');
const profileRepository = require('./profile.repository');
const {
  PRESETS,
  detectImageType,
  extensionForMime,
  findPreset,
  isPresetKey,
  isUploadFilename,
  presetPath,
  randomPresetKey,
  uploadContentType,
  uploadPath,
} = require('./profile.avatars');

const AVATAR_FIELD = 'avatar';
const AVATAR_ERROR_MESSAGE = 'Choose a PNG, JPEG, or WebP image.';
const PRESET_ERROR_MESSAGE = 'Choose one of the profile pictures.';
const MISSING_IMAGE_MESSAGE = 'Choose an image to upload.';

function avatarError(message) {
  return createError(400, message, { fieldErrors: { [AVATAR_FIELD]: message } });
}

function getUserOrThrow(db, userId) {
  const user = profileRepository.findById(db, userId);
  if (!user) {
    throw createError(404, 'That profile does not exist.');
  }
  return user;
}

function toProfile(user) {
  return {
    fullName: user.fullName,
    studentNo: user.studentNo,
    email: user.email,
    roleLabel: roleLabel(user.role),
    memberSinceLabel: memberSinceLabel(user.createdAt),
    avatarUrl: avatarUrl(user),
    initials: initials(user.fullName),
  };
}

function toAvatarChoices(user) {
  const selectedKey = user.avatarType === 'preset' ? user.avatarValue : null;
  return PRESETS.map((preset) => ({
    key: preset.key,
    label: preset.label,
    url: preset.url,
    isSelected: preset.key === selectedKey,
  }));
}

function getProfileView(db, userId) {
  const user = getUserOrThrow(db, userId);
  return {
    profile: toProfile(user),
    avatarChoices: toAvatarChoices(user),
    values: { fullName: user.fullName },
  };
}

function updateProfileName(db, { userId, fullName, actorUserId, requestId }) {
  return immediateTransaction(db, () => {
    const before = getUserOrThrow(db, userId);
    const after = profileRepository.updateFullName(db, { userId, fullName });

    writeAudit(db, {
      actorUserId,
      action: 'profile_update',
      entityType: 'user',
      entityId: userId,
      before: { fullName: before.fullName },
      after: { fullName: after.fullName },
      requestId,
    });

    return after;
  });
}

function avatarAuditRecord(user) {
  return {
    avatarType: user.avatarType,
    avatarValue: user.avatarValue,
  };
}

function staleUploadValue(before, after) {
  if (before.avatarType !== 'upload') {
    return null;
  }
  if (after.avatarType === 'upload' && before.avatarValue === after.avatarValue) {
    return null;
  }
  return before.avatarValue;
}

function removeUploadFile(value) {
  const filePath = uploadPath(value);
  if (!filePath) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

function changeAvatar(db, { userId, avatarType, avatarValue, actorUserId, requestId }) {
  const result = immediateTransaction(db, () => {
    const before = getUserOrThrow(db, userId);
    const after = profileRepository.updateAvatar(db, {
      userId,
      avatarType,
      avatarValue,
      avatarUpdatedAt: nowIso(),
    });

    writeAudit(db, {
      actorUserId,
      action: 'avatar_update',
      entityType: 'user',
      entityId: userId,
      before: avatarAuditRecord(before),
      after: avatarAuditRecord(after),
      requestId,
    });

    return { before, after };
  });

  removeUploadFile(staleUploadValue(result.before, result.after));
  return result.after;
}

function setPresetAvatar(db, { userId, presetKey, actorUserId, requestId }) {
  if (!isPresetKey(presetKey) || !findPreset(presetKey)) {
    throw avatarError(PRESET_ERROR_MESSAGE);
  }

  return changeAvatar(db, {
    userId,
    avatarType: 'preset',
    avatarValue: presetKey,
    actorUserId,
    requestId,
  });
}

function shuffleAvatar(db, { userId, actorUserId, requestId }) {
  const user = getUserOrThrow(db, userId);
  const currentKey = user.avatarType === 'preset' ? user.avatarValue : null;
  return setPresetAvatar(db, {
    userId,
    presetKey: randomPresetKey(currentKey),
    actorUserId,
    requestId,
  });
}

function buildUploadFilename(userId, extension) {
  const filename = `${userId}-${Date.now()}.${extension}`;
  if (!isUploadFilename(filename)) {
    throw avatarError(AVATAR_ERROR_MESSAGE);
  }
  return filename;
}

async function uploadAvatar(db, { userId, file, actorUserId, requestId }) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw avatarError(MISSING_IMAGE_MESSAGE);
  }

  const declaredExtension = extensionForMime(file.mimetype);
  const detected = detectImageType(file.buffer);
  if (!declaredExtension || !detected || detected.mimeType !== file.mimetype) {
    throw avatarError(AVATAR_ERROR_MESSAGE);
  }

  const filename = buildUploadFilename(userId, detected.extension);
  const filePath = uploadPath(filename);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, file.buffer, { flag: 'wx' });

  let after;
  try {
    after = changeAvatar(db, {
      userId,
      avatarType: 'upload',
      avatarValue: filename,
      actorUserId,
      requestId,
    });
  } catch (err) {
    removeUploadFile(filename);
    throw err;
  }

  return after;
}

function clearAvatar(db, { userId, actorUserId, requestId }) {
  return changeAvatar(db, {
    userId,
    avatarType: null,
    avatarValue: null,
    actorUserId,
    requestId,
  });
}

function getAvatarResource(db, userId) {
  const user = profileRepository.findById(db, userId);
  if (!user || !user.avatarType || !user.avatarValue) {
    throw createError(404, 'That profile picture does not exist.');
  }

  if (user.avatarType === 'preset') {
    const filePath = presetPath(user.avatarValue);
    if (!filePath) {
      throw createError(404, 'That profile picture does not exist.');
    }
    return { filePath, contentType: 'image/svg+xml', isPreset: true };
  }

  if (user.avatarType === 'upload') {
    const filePath = uploadPath(user.avatarValue);
    const contentType = uploadContentType(user.avatarValue);
    if (!filePath || !contentType) {
      throw createError(404, 'That profile picture does not exist.');
    }
    return { filePath, contentType, isPreset: false };
  }

  throw createError(404, 'That profile picture does not exist.');
}

module.exports = {
  getProfileView,
  updateProfileName,
  setPresetAvatar,
  shuffleAvatar,
  uploadAvatar,
  clearAvatar,
  getAvatarResource,
};
