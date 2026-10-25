const createError = require('http-errors');
const config = require('../../config');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { manilaNowParts, nowIso, serviceDate } = require('../../core/time');
const ticketsRepository = require('./tickets.repository');
const { evaluateJoinPolicy, toTicketView } = require('./tickets.rules');

const MAX_INSERT_ATTEMPTS = 2;
const TICKET_CODE_PAD = 3;
const UNIQUE_VIOLATION_CODE = 'SQLITE_CONSTRAINT_UNIQUE';
const RETRYABLE_CONSTRAINTS = Object.freeze([
  'tickets.service_id, tickets.service_date, tickets.sequence',
  'tickets.code, tickets.service_date',
]);

function isUniqueViolation(err) {
  if (!err || typeof err.message !== 'string') {
    return false;
  }
  if (err.code !== UNIQUE_VIOLATION_CODE) {
    return false;
  }
  return RETRYABLE_CONSTRAINTS.some((fragment) => err.message.includes(fragment));
}

function ticketCode(serviceCode, sequence) {
  return `${serviceCode}-${String(sequence).padStart(TICKET_CODE_PAD, '0')}`;
}

function findTicketOrThrow(db, ticketId) {
  const ticket = ticketsRepository.findTicketById(db, ticketId);
  if (!ticket) {
    throw createError(404, 'That ticket does not exist.');
  }
  return withWait(ticket);
}

function withWait(ticket) {
  if (!ticket) {
    return null;
  }
  const position = ticket.status === 'waiting' ? ticket.position : null;
  return {
    ...ticket,
    position,
    waitMinutes: position ? (position - 1) * ticket.avgMinutes : 0,
  };
}

function findOwnedTicketOrThrow(db, { ticketId, userId }) {
  const ticket = findTicketOrThrow(db, ticketId);
  if (ticket.userId !== userId) {
    throw createError(404, 'That ticket does not exist.');
  }
  return ticket;
}

function assertStatus(ticket, expected, message) {
  if (ticket.status !== expected) {
    throw createError(409, message);
  }
}

function getJoinContext(db, { userId, date = serviceDate() }) {
  return {
    activeCount: ticketsRepository.countActiveTicketsForUserToday(db, { userId, date }),
    noShowCount: ticketsRepository.countNoShowTicketsForUserToday(db, { userId, date }),
    lastTicketAt: ticketsRepository.findLatestTicketCreatedAtForUserToday(db, { userId, date }),
  };
}

function canJoinService({
  service,
  context,
  nowParts = manilaNowParts(),
  now = nowIso(),
  enforceHours = config.queueEnforceHours,
}) {
  return evaluateJoinPolicy({
    service,
    weekday: nowParts.weekday,
    minutes: nowParts.minutes,
    activeCount: context.activeCount,
    noShowCount: context.noShowCount,
    lastTicketAt: context.lastTicketAt,
    nowIso: now,
    enforceHours,
  }).allowed;
}

function joinQueue(db, { userId, serviceId, requestId, enforceHours = config.queueEnforceHours }) {
  const date = serviceDate();

  return immediateTransaction(db, () => {
    const service = ticketsRepository.findServiceById(db, serviceId);
    if (!service) {
      throw createError(404, 'That service window does not exist.');
    }

    const existing = ticketsRepository.findActiveTicketForUserService(db, {
      userId,
      serviceId,
      date,
    });
    if (existing) {
      return { ticket: existing, alreadyHeld: true };
    }

    const now = nowIso();
    const nowParts = manilaNowParts();
    const context = getJoinContext(db, { userId, date });
    const decision = evaluateJoinPolicy({
      service,
      weekday: nowParts.weekday,
      minutes: nowParts.minutes,
      activeCount: context.activeCount,
      noShowCount: context.noShowCount,
      lastTicketAt: context.lastTicketAt,
      nowIso: now,
      enforceHours,
    });
    if (!decision.allowed) {
      throw createError(decision.status, decision.message);
    }

    const createdAt = now;
    let sequence = ticketsRepository.nextSequence(db, { serviceId, date });
    let ticketId = null;

    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS && !ticketId; attempt += 1) {
      try {
        ticketId = ticketsRepository.insertTicket(db, {
          code: ticketCode(service.code, sequence),
          serviceId,
          userId,
          serviceDate: date,
          sequence,
          createdAt,
        });
      } catch (err) {
        const canRetry = isUniqueViolation(err) && attempt < MAX_INSERT_ATTEMPTS - 1;
        if (!canRetry) {
          throw err;
        }
        sequence = ticketsRepository.nextSequence(db, { serviceId, date });
      }
    }

    const ticket = findTicketOrThrow(db, ticketId);
    writeAudit(db, {
      actorUserId: userId,
      action: 'ticket.join',
      entityType: 'ticket',
      entityId: ticket.id,
      after: {
        code: ticket.code,
        serviceId,
        status: ticket.status,
        sequence: ticket.sequence,
      },
      requestId,
    });

    return { ticket, alreadyHeld: false };
  });
}

function leaveTicket(db, { userId, ticketId, requestId }) {
  return immediateTransaction(db, () => {
    const ticket = findOwnedTicketOrThrow(db, { ticketId, userId });
    assertStatus(ticket, 'waiting', 'Only a waiting ticket can be left.');

    const now = nowIso();
    ticketsRepository.markLeft(db, { ticketId, endedAt: now, updatedAt: now });

    writeAudit(db, {
      actorUserId: userId,
      action: 'ticket.leave',
      entityType: 'ticket',
      entityId: ticketId,
      before: { status: ticket.status },
      after: { status: 'left' },
      requestId,
    });

    return findTicketOrThrow(db, ticketId);
  });
}

function getStudentTicket(db, { userId, ticketId }) {
  return toTicketView(findOwnedTicketOrThrow(db, { ticketId, userId }));
}

function getStaffTicket(db, ticketId) {
  return toTicketView(findTicketOrThrow(db, ticketId));
}

function callNext(db, { serviceId, staffUserId, requestId }) {
  const date = serviceDate();

  return immediateTransaction(db, () => {
    const service = ticketsRepository.findServiceById(db, serviceId);
    if (!service) {
      throw createError(404, 'That service window does not exist.');
    }

    const waiting = ticketsRepository.findOldestWaitingForService(db, { serviceId, date });
    if (!waiting) {
      return null;
    }

    const counter = ticketsRepository.findCounterForService(db, serviceId);
    const now = nowIso();
    ticketsRepository.markCalled(db, {
      ticketId: waiting.id,
      counterId: counter ? counter.id : null,
      calledBy: staffUserId,
      calledAt: now,
      updatedAt: now,
    });

    const ticket = findTicketOrThrow(db, waiting.id);
    writeAudit(db, {
      actorUserId: staffUserId,
      action: 'ticket.call',
      entityType: 'ticket',
      entityId: ticket.id,
      before: { status: waiting.status, callCount: waiting.callCount },
      after: {
        status: ticket.status,
        callCount: ticket.callCount,
        counterId: ticket.counterId,
      },
      requestId,
    });

    return ticket;
  });
}

function startTicket(db, { ticketId, staffUserId, requestId }) {
  return immediateTransaction(db, () => {
    const ticket = findTicketOrThrow(db, ticketId);
    assertStatus(ticket, 'called', 'Only a called ticket can be started.');

    const now = nowIso();
    ticketsRepository.markServing(db, { ticketId, startedAt: now, updatedAt: now });

    writeAudit(db, {
      actorUserId: staffUserId,
      action: 'ticket.start',
      entityType: 'ticket',
      entityId: ticketId,
      before: { status: ticket.status },
      after: { status: 'serving' },
      requestId,
    });

    return findTicketOrThrow(db, ticketId);
  });
}

function serveTicket(db, { ticketId, staffUserId, requestId }) {
  return immediateTransaction(db, () => {
    const ticket = findTicketOrThrow(db, ticketId);
    assertStatus(ticket, 'serving', 'Only a serving ticket can be completed.');

    const now = nowIso();
    ticketsRepository.markServed(db, { ticketId, endedAt: now, updatedAt: now });

    writeAudit(db, {
      actorUserId: staffUserId,
      action: 'ticket.serve',
      entityType: 'ticket',
      entityId: ticketId,
      before: { status: ticket.status },
      after: { status: 'served' },
      requestId,
    });

    return findTicketOrThrow(db, ticketId);
  });
}

function noShowTicket(db, { ticketId, staffUserId, requestId }) {
  return immediateTransaction(db, () => {
    const ticket = findTicketOrThrow(db, ticketId);
    assertStatus(ticket, 'called', 'Only a called ticket can be marked no-show.');

    const now = nowIso();
    ticketsRepository.markNoShow(db, { ticketId, endedAt: now, updatedAt: now });

    writeAudit(db, {
      actorUserId: staffUserId,
      action: 'ticket.no_show',
      entityType: 'ticket',
      entityId: ticketId,
      before: { status: ticket.status },
      after: { status: 'no_show' },
      requestId,
    });

    return findTicketOrThrow(db, ticketId);
  });
}

function recallTicket(db, { ticketId, staffUserId, requestId }) {
  return immediateTransaction(db, () => {
    const ticket = findTicketOrThrow(db, ticketId);
    assertStatus(ticket, 'called', 'Only a called ticket can be recalled.');

    const now = nowIso();
    ticketsRepository.markRecalled(db, { ticketId, calledAt: now, updatedAt: now });

    writeAudit(db, {
      actorUserId: staffUserId,
      action: 'ticket.recall',
      entityType: 'ticket',
      entityId: ticketId,
      before: { status: ticket.status, callCount: ticket.callCount },
      after: { status: ticket.status, callCount: ticket.callCount + 1 },
      requestId,
    });

    return findTicketOrThrow(db, ticketId);
  });
}

module.exports = {
  joinQueue,
  getJoinContext,
  canJoinService,
  leaveTicket,
  getStudentTicket,
  getStaffTicket,
  callNext,
  startTicket,
  serveTicket,
  noShowTicket,
  recallTicket,
  ticketCode,
};
