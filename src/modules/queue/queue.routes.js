const express = require('express');
const queueService = require('./queue.service');
const ticketsService = require('../tickets/tickets.service');
const { validateParams } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const { ticketParamsSchema, serviceParamsSchema } = require('../tickets/tickets.schemas');

function createQueueRouter({ db, security }) {
  const router = express.Router();

  router.get('/queue', security.requireRole('student'), (req, res) => {
    const dashboard = queueService.getStudentDashboard(db, req.user.id);

    res.render('pages/queue-dashboard', {
      title: 'My queue',
      tickets: dashboard.tickets,
      services: dashboard.services,
      todayLabel: dashboard.todayLabel,
      openCount: dashboard.openCount,
      serviceCount: dashboard.serviceCount,
      hasTickets: dashboard.hasTickets,
      hasServices: dashboard.hasServices,
    });
  });

  router.get(
    '/queue/tickets/:id',
    security.requireRole('student'),
    validateParams(ticketParamsSchema),
    (req, res) => {
      const ticket = ticketsService.getStudentTicket(db, {
        userId: req.user.id,
        ticketId: req.validatedParams.id,
      });

      res.render('pages/ticket', {
        title: `Ticket ${ticket.code}`,
        ticket,
      });
    },
  );

  router.post(
    '/queue/tickets/:id/leave',
    security.requireRole('student'),
    validateParams(ticketParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.leaveTicket(db, {
          userId: req.user.id,
          ticketId: req.validatedParams.id,
          requestId: req.id,
        });
        setFlash(req, 'success', `Ticket ${ticket.code} was left.`);
        res.redirect(303, '/queue');
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/api/queue/status', security.requireRole('student'), (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(queueService.getStudentCallStatus(db, req.user.id));
  });

  router.get(
    '/queue/:serviceId',
    security.requireRole('student'),
    validateParams(serviceParamsSchema),
    (req, res) => {
      const detail = queueService.getServiceDetail(db, {
        userId: req.user.id,
        serviceId: req.validatedParams.serviceId,
      });

      res.render('pages/queue-service', {
        title: detail.service.name,
        service: detail.service,
        activeTicket: detail.activeTicket,
        canJoin: detail.canJoin,
      });
    },
  );

  router.post(
    '/queue/:serviceId/join',
    security.requireRole('student'),
    security.joinLimiter,
    validateParams(serviceParamsSchema),
    (req, res, next) => {
      try {
        const result = ticketsService.joinQueue(db, {
          userId: req.user.id,
          serviceId: req.validatedParams.serviceId,
          requestId: req.id,
        });

        if (result.alreadyHeld) {
          setFlash(req, 'notice', `You already hold ticket ${result.ticket.code} for this window.`);
        } else {
          setFlash(req, 'success', `Ticket ${result.ticket.code} is yours. Watch this page for your turn.`);
        }
        res.redirect(303, `/queue/tickets/${result.ticket.id}`);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

module.exports = {
  createQueueRouter,
};
