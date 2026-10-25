const express = require('express');
const queueService = require('../queue/queue.service');
const ticketsService = require('../tickets/tickets.service');
const { validateParams } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const { ticketParamsSchema, serviceParamsSchema } = require('../tickets/tickets.schemas');

function createStaffRouter({ db, security }) {
  const router = express.Router();

  router.get('/staff/queue', security.requireRole('staff', 'admin'), (_req, res) => {
    const queue = queueService.getStaffConsole(db);

    res.render('pages/staff-queue', {
      title: 'Staff queue',
      tickets: queue.tickets,
      services: queue.services,
      counts: queue.counts,
      todayLabel: queue.todayLabel,
      hasTickets: queue.hasTickets,
      hasServices: queue.hasServices,
    });
  });

  router.post(
    '/staff/queue/:serviceId/call-next',
    security.requireRole('staff', 'admin'),
    validateParams(serviceParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.callNext(db, {
          serviceId: req.validatedParams.serviceId,
          staffUserId: req.user.id,
          requestId: req.id,
        });

        if (!ticket) {
          setFlash(req, 'notice', 'No one is waiting for that window.');
        } else {
          setFlash(req, 'success', `Now calling ticket ${ticket.code}.`);
        }
        res.redirect(303, '/staff/queue');
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/staff/tickets/:id',
    security.requireRole('staff', 'admin'),
    validateParams(ticketParamsSchema),
    (req, res) => {
      const ticket = ticketsService.getStaffTicket(db, req.validatedParams.id);

      res.render('pages/staff-ticket', {
        title: `Ticket ${ticket.code}`,
        ticket,
      });
    },
  );

  router.post(
    '/staff/tickets/:id/start',
    security.requireRole('staff', 'admin'),
    validateParams(ticketParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.startTicket(db, {
          ticketId: req.validatedParams.id,
          staffUserId: req.user.id,
          requestId: req.id,
        });
        setFlash(req, 'success', `Ticket ${ticket.code} is now being served.`);
        res.redirect(303, `/staff/tickets/${ticket.id}`);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/staff/tickets/:id/serve',
    security.requireRole('staff', 'admin'),
    validateParams(ticketParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.serveTicket(db, {
          ticketId: req.validatedParams.id,
          staffUserId: req.user.id,
          requestId: req.id,
        });
        setFlash(req, 'success', `Ticket ${ticket.code} is complete.`);
        res.redirect(303, '/staff/queue');
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/staff/tickets/:id/no-show',
    security.requireRole('staff', 'admin'),
    validateParams(ticketParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.noShowTicket(db, {
          ticketId: req.validatedParams.id,
          staffUserId: req.user.id,
          requestId: req.id,
        });
        setFlash(req, 'notice', `Ticket ${ticket.code} was marked no-show.`);
        res.redirect(303, '/staff/queue');
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/staff/tickets/:id/recall',
    security.requireRole('staff', 'admin'),
    validateParams(ticketParamsSchema),
    (req, res, next) => {
      try {
        const ticket = ticketsService.recallTicket(db, {
          ticketId: req.validatedParams.id,
          staffUserId: req.user.id,
          requestId: req.id,
        });
        setFlash(req, 'success', `Ticket ${ticket.code} was called again.`);
        res.redirect(303, `/staff/tickets/${ticket.id}`);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

module.exports = {
  createStaffRouter,
};
