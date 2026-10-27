const nodemailer = require('nodemailer');

function createEtherealMailer(mailConfig, { logger } = {}) {
  let transporterPromise = null;

  async function getTransporter() {
    if (!transporterPromise) {
      transporterPromise = nodemailer.createTestAccount().then((account) => nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      }));
    }
    return transporterPromise;
  }

  return {
    async send({ to, subject, html, text }) {
      const transporter = await getTransporter();
      const message = {
        from: mailConfig.from,
        to,
        subject,
        html,
        text,
      };
      if (mailConfig.replyTo) {
        message.replyTo = mailConfig.replyTo;
      }

      const info = await transporter.sendMail(message);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl && !mailConfig.isProduction && logger) {
        logger.info({ previewUrl }, 'ethereal preview available');
      }
      return { id: info.messageId };
    },
  };
}

module.exports = {
  createEtherealMailer,
};
