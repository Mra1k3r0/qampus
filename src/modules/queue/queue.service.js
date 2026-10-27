const createError = require('http-errors');
const queueRepository = require('./queue.repository');
const ticketsService = require('../tickets/tickets.service');
const { manilaNowParts, nowIso, serviceDate, serviceDateLabel } = require('../../core/time');
const { estimateWaitMinutes, toServiceView, toTicketView } = require('../tickets/tickets.rules');

function withWait(tickets, now = nowIso()) {
  return tickets.map((ticket) => {
    if (ticket.status !== 'waiting' || !ticket.position) {
      return { ...ticket, position: null, waitMinutes: 0 };
    }

    return {
      ...ticket,
      waitMinutes: estimateWaitMinutes({
        position: ticket.position,
        avgMinutes: ticket.avgMinutes,
        currentStatus: ticket.currentStatus,
        currentStartedAt: ticket.currentStartedAt,
        now,
      }),
    };
  });
}

function listServices(db) {
  return queueRepository.listServices(db).map((service) => toServiceView(service));
}

function getStudentDashboard(db, userId, date = serviceDate()) {
  const tickets = withWait(queueRepository.listActiveTicketsForUser(db, { userId, date }))
    .map((ticket) => toTicketView(ticket));
  const byService = new Map(tickets.map((ticket) => [ticket.serviceId, ticket]));
  const context = ticketsService.getJoinContext(db, { userId, date });
  const nowParts = manilaNowParts();
  const now = nowIso();
  const services = queueRepository.listServicesWithStatus(db, date).map((service) => {
    const activeTicket = byService.get(service.id) || null;
    return toServiceView({
      ...service,
      activeTicketId: activeTicket ? activeTicket.id : null,
      canJoin: !activeTicket
        && ticketsService.canJoinService({ service, context, nowParts, now }),
    });
  });
  const openCount = services.filter((service) => service.isOpen).length;

  return {
    tickets,
    services,
    todayLabel: serviceDateLabel(),
    openCount,
    serviceCount: services.length,
    hasTickets: tickets.length > 0,
    hasServices: services.length > 0,
  };
}

function getStudentCallStatus(db, userId, date = serviceDate()) {
  const tickets = queueRepository
    .listActiveTicketsForUser(db, { userId, date })
    .map((ticket) => ({
      id: ticket.id,
      code: ticket.code,
      serviceName: ticket.serviceName,
      counterName: ticket.counterName,
      status: ticket.status,
      callCount: ticket.callCount,
    }));

  return { tickets, updatedAt: nowIso() };
}

function getServiceDetail(db, { userId, serviceId, date = serviceDate() }) {
  const services = queueRepository.listServicesWithStatus(db, date);
  const row = services.find((service) => service.id === serviceId);
  if (!row) {
    throw createError(404, 'That service window does not exist.');
  }

  const active = queueRepository
    .listActiveTicketsForUser(db, { userId, date })
    .find((ticket) => ticket.serviceId === serviceId);
  const activeTicket = active ? toTicketView(withWait([active])[0]) : null;
  const service = toServiceView(row);
  const context = ticketsService.getJoinContext(db, { userId, date });

  return {
    service,
    activeTicket,
    canJoin: !activeTicket
      && ticketsService.canJoinService({ service: row, context }),
  };
}

function getStaffConsole(db, date = serviceDate()) {
  const tickets = withWait(queueRepository.listActiveTicketsForDate(db, date))
    .map((ticket) => toTicketView(ticket));
  const services = queueRepository.listServicesWithStatus(db, date)
    .map((service) => toServiceView(service));
  const counts = queueRepository.countTicketsByStatus(db, date);

  return {
    tickets,
    services,
    counts: {
      waiting: counts.waiting || 0,
      serving: (counts.called || 0) + (counts.serving || 0),
      servedToday: counts.served || 0,
    },
    todayLabel: serviceDateLabel(),
    hasTickets: tickets.length > 0,
    hasServices: services.length > 0,
  };
}

function getDisplayBoard(db, date = serviceDate()) {
  const services = queueRepository.listServicesWithStatus(db, date);
  const updatedAt = queueRepository.latestUpdatedAt(db, date) || nowIso();

  return {
    services: services.map((service) => ({
      code: service.code,
      name: service.name,
      ticketCode: service.currentCode,
      counter: service.currentCounter,
      waitingCount: service.waitingCount,
      updatedAt: service.currentUpdatedAt || updatedAt,
    })),
    updatedAt,
  };
}

module.exports = {
  listServices,
  getStudentDashboard,
  getStudentCallStatus,
  getServiceDetail,
  getStaffConsole,
  getDisplayBoard,
};
