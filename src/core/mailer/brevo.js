const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_ERROR_DETAIL_LENGTH = 500;

function parseSender(from) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(from || ''));
  if (match) {
    return { name: match[1] || undefined, email: match[2] };
  }
  return { email: String(from || '').trim() };
}

function mailError(message, { status, retryable, detail }) {
  const error = new Error(message);
  error.status = status;
  error.retryable = retryable;
  if (detail) {
    error.detail = detail;
  }
  return error;
}

async function readErrorDetail(response) {
  try {
    const detail = await response.text();
    return String(detail || '').slice(0, MAX_ERROR_DETAIL_LENGTH);
  } catch {
    return '';
  }
}

function createBrevoMailer(mailConfig, { logger, fetchImpl = fetch } = {}) {
  return {
    async send({ to, subject, html, text, idempotencyKey }) {
      const headers = {
        'api-key': mailConfig.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      };

      const body = {
        sender: parseSender(mailConfig.from),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      };
      if (idempotencyKey) {
        body.headers = { idempotencyKey: String(idempotencyKey) };
      }
      if (mailConfig.replyTo) {
        body.replyTo = { email: mailConfig.replyTo };
      }

      let response;
      try {
        response = await fetchImpl(BREVO_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        if (logger) {
          logger.warn({ err: err.message }, 'brevo request failed');
        }
        throw mailError('The mail provider could not be reached.', {
          status: 0,
          retryable: true,
          detail: err.message,
        });
      }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        if (logger) {
          logger.warn({ status: response.status }, 'brevo rejected a message');
        }
        throw mailError(`The mail provider rejected the message with status ${response.status}.`, {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
          detail,
        });
      }

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }
      return { id: payload.messageId || null };
    },
  };
}

module.exports = {
  createBrevoMailer,
};
