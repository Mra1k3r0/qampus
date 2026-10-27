const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { nowIso, serviceDate, serviceDayEndIso } = require('../../core/time');
const ticketsRepository = require('./tickets.repository');

function expireStaleTickets(db, { requestId = null, dryRun = false } = {}) {
  return immediateTransaction(db, () => {
    const date = serviceDate();
    const stale = ticketsRepository.findStaleActiveTickets(db, { beforeDate: date });
    if (dryRun) {
      return { date, expired: stale.length, dryRun: true };
    }

    const updatedAt = nowIso();
    let expired = 0;
    for (const ticket of stale) {
      const changed = ticketsRepository.expireTicket(db, {
        ticketId: ticket.id,
        status: ticket.status,
        endedAt: serviceDayEndIso(ticket.service_date),
        updatedAt,
      });
      if (!changed) {
        continue;
      }
      expired += 1;
      writeAudit(db, {
        action: 'ticket.expire',
        entityType: 'ticket',
        entityId: ticket.id,
        before: {
          status: ticket.status,
          serviceDate: ticket.service_date,
        },
        after: {
          status: 'expired',
          serviceDate: ticket.service_date,
          reason: 'service_day_ended',
        },
        requestId,
      });
    }

    return { date, expired, dryRun: false };
  });
}

function createDailySweep({ db, logger }) {
  let lastSweptDate = null;

  return function sweepStaleTickets(req, _res, next) {
    const date = serviceDate();
    if (lastSweptDate === date) {
      next();
      return;
    }

    try {
      const result = expireStaleTickets(db, { requestId: req.id });
      lastSweptDate = date;
      if (result.expired > 0) {
        logger.info({ date, expired: result.expired }, 'expired stale tickets');
      }
    } catch (err) {
      logger.error({ err }, 'failed to expire stale tickets');
    }
    next();
  };
}

module.exports = {
  expireStaleTickets,
  createDailySweep,
};
