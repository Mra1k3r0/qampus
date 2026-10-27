const path = require('node:path');
const ejs = require('ejs');
const { formatDateTime } = require('../time');

const DEFAULT_VIEWS_DIR = path.join(__dirname, '..', '..', '..', 'views', 'emails');
const DEFAULT_TTL_MINUTES = 10;

const TEMPLATES = Object.freeze({
  'verify-code': {
    preheader: 'Your 8-digit code expires in 10 minutes.',
    text: (data) => [
      `Your Qampus verification code is ${data.code}.`,
      '',
      `This code expires in 10 minutes, at ${data.expiresLabel}.`,
      '',
      'If you did not create a Qampus account, you can ignore this email.',
    ].join('\n'),
  },
  'reset-code': {
    preheader: 'Use this code to reset your password.',
    text: (data) => [
      `Use this code to reset your Qampus password: ${data.code}.`,
      '',
      `This code expires in 10 minutes, at ${data.expiresLabel}.`,
      '',
      'If you did not request a password reset, contact the office.',
    ].join('\n'),
  },
  'password-changed': {
    preheader: 'If this was not you, contact the office.',
    text: () => [
      'The password for your Qampus account was changed.',
      '',
      'If this was not you, contact the office.',
    ].join('\n'),
  },
  'account-exists': {
    preheader: 'Sign in or reset your password.',
    text: () => [
      'You already have a Qampus account.',
      '',
      'Sign in or reset your password. If this was not you, you can ignore this email.',
    ].join('\n'),
  },
});

function expiryLabel(expiresAt) {
  if (!expiresAt) {
    return '';
  }
  return `${formatDateTime(expiresAt)} PHT`;
}

function createRenderer({ viewsDir = DEFAULT_VIEWS_DIR } = {}) {
  return async function render({ template, data = {} }) {
    const meta = TEMPLATES[template];
    if (!meta) {
      throw new Error(`Unknown email template: ${template}`);
    }

    const viewData = {
      ...data,
      expiresLabel: expiryLabel(data.expiresAt),
      ttlMinutes: data.ttlMinutes || DEFAULT_TTL_MINUTES,
    };
    const content = await ejs.renderFile(
      path.join(viewsDir, `${template}.ejs`),
      viewData,
      { cache: false },
    );
    const html = await ejs.renderFile(
      path.join(viewsDir, 'shell.ejs'),
      { preheader: meta.preheader, content },
      { cache: false },
    );

    return { html, text: meta.text(viewData) };
  };
}

module.exports = {
  createRenderer,
  TEMPLATE_NAMES: Object.freeze(Object.keys(TEMPLATES)),
};
