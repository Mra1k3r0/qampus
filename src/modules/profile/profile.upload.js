const multer = require('multer');
const createError = require('http-errors');
const config = require('../../config');

const AVATAR_UPLOAD_PATH = '/profile/avatar/upload';
const AVATAR_FIELD = 'avatar';
const FILE_TOO_LARGE_MESSAGE = `That image is larger than ${config.avatarMaxBytes / (1024 * 1024)} MB.`;
const UPLOAD_FAILED_MESSAGE = 'That image could not be uploaded. Try again.';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.avatarMaxBytes,
    files: 1,
  },
});

const singleAvatar = upload.single(AVATAR_FIELD);

function toUploadError(err) {
  const message = err && err.code === 'LIMIT_FILE_SIZE'
    ? FILE_TOO_LARGE_MESSAGE
    : UPLOAD_FAILED_MESSAGE;
  return createError(400, message, { fieldErrors: { avatar: message } });
}

function avatarUploadPreCsrf(req, res, next) {
  singleAvatar(req, res, (err) => {
    if (err) {
      req.avatarUploadError = toUploadError(err);
    }
    next();
  });
}

module.exports = {
  AVATAR_UPLOAD_PATH,
  AVATAR_FIELD,
  avatarUploadPreCsrf,
  toUploadError,
};
