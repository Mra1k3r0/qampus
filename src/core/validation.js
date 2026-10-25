const createError = require('http-errors');

function parseOrThrow(schema, input) {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'form';
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  throw createError(400, 'Check the highlighted fields.', { fieldErrors });
}

function validateBody(schema, { onError } = {}) {
  return function validate(req, res, next) {
    try {
      req.validatedBody = parseOrThrow(schema, req.body);
      next();
    } catch (err) {
      if (onError) {
        onError(err, req, res, next);
        return;
      }
      next(err);
    }
  };
}

function validateParams(schema) {
  return function validate(req, _res, next) {
    try {
      req.validatedParams = parseOrThrow(schema, req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  parseOrThrow,
  validateBody,
  validateParams,
};
