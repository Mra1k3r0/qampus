const fs = require('node:fs');
const express = require('express');
const createError = require('http-errors');
const { setFlash } = require('../../core/context');
const { validateBody } = require('../../core/validation');
const { updateProfileSchema, presetAvatarSchema } = require('./profile.schemas');
const profileService = require('./profile.service');

const NUMERIC_ID_PATTERN = /^\d+$/;
const PROFILE_PATH = '/profile';
const AVATAR_CACHE_CONTROL = 'public, max-age=300';
const AVATAR_CSP = "default-src 'none'; style-src 'unsafe-inline'";

function submittedName(body) {
  return typeof body.fullName === 'string' ? body.fullName : '';
}

function createProfileRouter({ db, security }) {
  const router = express.Router();

  function renderProfile(req, res, { status = 200, errors = {}, values = null } = {}) {
    const view = profileService.getProfileView(db, req.user.id);
    res.status(status).render('pages/profile', {
      title: 'Profile settings',
      profile: view.profile,
      avatarChoices: view.avatarChoices,
      values: values || view.values,
      errors,
    });
  }

  function renderAvatarError(req, res, message) {
    renderProfile(req, res, {
      status: 400,
      errors: { avatar: message },
    });
  }

  function redirectToProfile(req, res, message) {
    setFlash(req, 'success', message);
    res.redirect(303, PROFILE_PATH);
  }

  router.get(PROFILE_PATH, security.requireAuth, (req, res) => {
    renderProfile(req, res);
  });

  router.post(
    PROFILE_PATH,
    security.requireAuth,
    validateBody(updateProfileSchema, {
      onError(err, req, res, next) {
        if (err.status === 400) {
          renderProfile(req, res, {
            status: 400,
            errors: err.fieldErrors || { form: err.message },
            values: { fullName: submittedName(req.body) },
          });
          return;
        }
        next(err);
      },
    }),
    (req, res, next) => {
      try {
        profileService.updateProfileName(db, {
          userId: req.user.id,
          fullName: req.validatedBody.fullName,
          actorUserId: req.user.id,
          requestId: req.id,
        });
        redirectToProfile(req, res, 'Profile updated.');
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/profile/avatar/preset',
    security.requireAuth,
    validateBody(presetAvatarSchema, {
      onError(err, req, res, next) {
        if (err.status === 400) {
          renderAvatarError(
            req,
            res,
            (err.fieldErrors && err.fieldErrors.preset) || 'Choose one of the profile pictures.',
          );
          return;
        }
        next(err);
      },
    }),
    (req, res, next) => {
      try {
        profileService.setPresetAvatar(db, {
          userId: req.user.id,
          presetKey: req.validatedBody.preset,
          actorUserId: req.user.id,
          requestId: req.id,
        });
        redirectToProfile(req, res, 'Profile picture updated.');
      } catch (err) {
        if (err.status === 400) {
          renderAvatarError(req, res, err.message);
          return;
        }
        next(err);
      }
    },
  );

  router.post('/profile/avatar/shuffle', security.requireAuth, (req, res, next) => {
    try {
      profileService.shuffleAvatar(db, {
        userId: req.user.id,
        actorUserId: req.user.id,
        requestId: req.id,
      });
      redirectToProfile(req, res, 'Profile picture updated.');
    } catch (err) {
      next(err);
    }
  });

  router.post('/profile/avatar/upload', security.requireAuth, async (req, res, next) => {
    if (req.avatarUploadError) {
      const message = req.avatarUploadError.fieldErrors
        ? req.avatarUploadError.fieldErrors.avatar
        : req.avatarUploadError.message;
      renderAvatarError(req, res, message);
      return;
    }

    try {
      await profileService.uploadAvatar(db, {
        userId: req.user.id,
        file: req.file,
        actorUserId: req.user.id,
        requestId: req.id,
      });
      redirectToProfile(req, res, 'Profile picture updated.');
    } catch (err) {
      if (err.status === 400) {
        const message = err.fieldErrors ? err.fieldErrors.avatar : err.message;
        renderAvatarError(req, res, message);
        return;
      }
      next(err);
    }
  });

  router.post('/profile/avatar/clear', security.requireAuth, (req, res, next) => {
    try {
      profileService.clearAvatar(db, {
        userId: req.user.id,
        actorUserId: req.user.id,
        requestId: req.id,
      });
      redirectToProfile(req, res, 'Profile picture removed.');
    } catch (err) {
      next(err);
    }
  });

  router.get('/avatar/:userId', async (req, res, next) => {
    if (!NUMERIC_ID_PATTERN.test(req.params.userId)) {
      next(createError(404, 'That profile picture does not exist.'));
      return;
    }

    try {
      const resource = profileService.getAvatarResource(db, Number(req.params.userId));
      const stats = await fs.promises.stat(resource.filePath);
      if (!stats.isFile()) {
        next(createError(404, 'That profile picture does not exist.'));
        return;
      }

      res.set({
        'Content-Type': resource.contentType,
        'Cache-Control': AVATAR_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': AVATAR_CSP,
      });

      const stream = fs.createReadStream(resource.filePath);
      stream.on('error', next);
      stream.pipe(res);
    } catch (err) {
      if (err.code === 'ENOENT') {
        next(createError(404, 'That profile picture does not exist.'));
        return;
      }
      next(err);
    }
  });

  return router;
}

module.exports = {
  createProfileRouter,
};
