const { createBrevoMailer } = require('./brevo');
const { createEtherealMailer } = require('./ethereal');
const { createMemoryMailer } = require('./memory');

function createMailer(config, { logger, fetchImpl } = {}) {
  const mailConfig = config && config.mail;
  if (!mailConfig) {
    throw new Error('createMailer requires config.mail.');
  }

  switch (mailConfig.driver) {
    case 'memory':
      return createMemoryMailer();
    case 'brevo':
      return createBrevoMailer(mailConfig, { logger, fetchImpl });
    case 'ethereal':
      return createEtherealMailer(
        { ...mailConfig, isProduction: Boolean(config.isProduction) },
        { logger },
      );
    default:
      throw new Error(`Unknown MAIL_DRIVER: ${mailConfig.driver}.`);
  }
}

module.exports = {
  createMailer,
};
