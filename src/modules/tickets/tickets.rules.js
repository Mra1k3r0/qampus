const {
  clockLabel,
  dateTimeLabel,
  openDaysLabel,
  parseClockMinutes,
  serviceHoursLabel,
} = require('../../core/time');

const JOIN_CUTOFF_MINUTES = 30;
const JOIN_COOLDOWN_SECONDS = 60;
const MAX_ACTIVE_TICKETS = 2;
const NO_SHOW_LIMIT = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = 60000;

const JOIN_MESSAGES = Object.freeze({
  closed: 'That service window is closed right now.',
  closingSoon: 'That window closes soon. Try again when it reopens.',
  cap: 'You already hold 2 tickets today. Finish or leave one first.',
  cooldown: 'Give it a minute before taking another ticket.',
  noShow: 'You missed two calls today. You can join again tomorrow.',
});

const STATUS = Object.freeze({
  waiting: Object.freeze({ label: 'Waiting', tone: 'neutral', className: 'waiting', isActive: true }),
  called: Object.freeze({ label: 'Called', tone: 'warning', className: 'called', isActive: true }),
  serving: Object.freeze({ label: 'Serving', tone: 'info', className: 'serving', isActive: true }),
  served: Object.freeze({ label: 'Completed', tone: 'success', className: 'completed', isActive: false }),
  no_show: Object.freeze({ label: 'No-show', tone: 'danger', className: 'noshow', isActive: false }),
  left: Object.freeze({ label: 'Left', tone: 'muted', className: 'left', isActive: false }),
});

const FALLBACK_STATUS = Object.freeze({ label: 'Unknown', tone: 'neutral', className: 'waiting', isActive: false });

const ACTIVE_STATUSES = new Set(Object.keys(STATUS).filter((status) => STATUS[status].isActive));

function statusMeta(status) {
  return STATUS[status] || FALLBACK_STATUS;
}

function statusLabel(status) {
  return statusMeta(status).label;
}

function statusClass(status) {
  return statusMeta(status).className;
}

function statusTone(status) {
  return statusMeta(status).tone;
}

function isOwner(ticket, user) {
  return Boolean(ticket) && Boolean(user) && ticket.userId === user.id;
}

function canViewTicket(ticket, user) {
  if (!ticket || !user) {
    return false;
  }
  if (user.role === 'staff' || user.role === 'admin') {
    return true;
  }
  return isOwner(ticket, user);
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(status);
}

function isWaiting(ticket) {
  return Boolean(ticket) && ticket.status === 'waiting';
}

function isAtDesk(ticket) {
  return Boolean(ticket) && (ticket.status === 'called' || ticket.status === 'serving');
}

function canLeave(ticket, user) {
  return isOwner(ticket, user) && isWaiting(ticket);
}

function canJoin(user) {
  return Boolean(user) && user.role === 'student';
}

function parseOpenDays(openDays) {
  if (Array.isArray(openDays)) {
    return openDays;
  }
  if (typeof openDays !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(openDays);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function windowRejection({ service, weekday, minutes, cutoffMinutes = JOIN_CUTOFF_MINUTES }) {
  const days = parseOpenDays(service.openDays);
  const opensAt = parseClockMinutes(service.opensAt);
  const closesAt = parseClockMinutes(service.closesAt);

  if (!days || opensAt === null || closesAt === null) {
    return JOIN_MESSAGES.closed;
  }
  if (!days.includes(weekday) || minutes < opensAt) {
    return JOIN_MESSAGES.closed;
  }
  if (minutes >= closesAt - cutoffMinutes) {
    return JOIN_MESSAGES.closingSoon;
  }
  return null;
}

function isWithinServiceWindow({ service, weekday, minutes, cutoffMinutes = JOIN_CUTOFF_MINUTES }) {
  if (!service) {
    return false;
  }
  return windowRejection({ service, weekday, minutes, cutoffMinutes }) === null;
}

function deny(status, message) {
  return { allowed: false, status, message };
}

function evaluateJoinPolicy({
  service,
  weekday,
  minutes,
  activeCount = 0,
  noShowCount = 0,
  lastTicketAt = null,
  nowIso = null,
  enforceHours = true,
}) {
  if (!service || !service.isOpen) {
    return deny(409, JOIN_MESSAGES.closed);
  }

  if (enforceHours) {
    const reason = windowRejection({ service, weekday, minutes });
    if (reason) {
      return deny(409, reason);
    }
  }

  if (noShowCount >= NO_SHOW_LIMIT) {
    return deny(409, JOIN_MESSAGES.noShow);
  }

  if (activeCount >= MAX_ACTIVE_TICKETS) {
    return deny(409, JOIN_MESSAGES.cap);
  }

  if (lastTicketAt && nowIso) {
    const elapsedSeconds = (Date.parse(nowIso) - Date.parse(lastTicketAt)) / MILLISECONDS_PER_SECOND;
    if (Number.isFinite(elapsedSeconds) && elapsedSeconds < JOIN_COOLDOWN_SECONDS) {
      return deny(429, JOIN_MESSAGES.cooldown);
    }
  }

  return { allowed: true, status: null, message: null };
}

function remainingServiceMinutes({ avgMinutes, startedAt, now }) {
  const start = Date.parse(startedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(current)) {
    return avgMinutes;
  }
  const elapsedMinutes = Math.max(0, (current - start) / MILLISECONDS_PER_MINUTE);
  return Math.max(0, avgMinutes - elapsedMinutes);
}

function estimateWaitMinutes({
  position,
  avgMinutes,
  currentStatus = null,
  currentStartedAt = null,
  now = null,
} = {}) {
  const place = Number(position);
  if (!Number.isFinite(place) || place < 1) {
    return 0;
  }

  const average = Number(avgMinutes);
  const serviceMinutes = Number.isFinite(average) ? Math.max(0, average) : 0;
  let minutes = (place - 1) * serviceMinutes;

  if (currentStatus === 'called') {
    minutes += serviceMinutes;
  } else if (currentStatus === 'serving') {
    minutes += remainingServiceMinutes({
      avgMinutes: serviceMinutes,
      startedAt: currentStartedAt,
      now,
    });
  }

  return Math.max(0, Math.round(minutes));
}

function positionText(ticket) {
  if (!ticket) {
    return '-';
  }
  if (isWaiting(ticket)) {
    return ticket.position ? String(ticket.position) : '-';
  }
  if (isAtDesk(ticket)) {
    return 'At the window';
  }
  return '-';
}

function etaText(ticket) {
  if (!ticket) {
    return '-';
  }
  if (isWaiting(ticket)) {
    const minutes = Number.isFinite(ticket.waitMinutes) ? ticket.waitMinutes : 0;
    return `${minutes} min`;
  }
  if (isAtDesk(ticket)) {
    return 'Now';
  }
  return '-';
}

function counterText(ticket) {
  if (!ticket) {
    return 'Not called';
  }
  if (ticket.counterName) {
    return ticket.counterName;
  }
  return isAtDesk(ticket) ? 'Assigned at the desk' : 'Not called';
}

function queueCountText(count) {
  const total = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${total} waiting`;
}

function currentServingText(service) {
  if (!service || !service.currentCode) {
    return 'No ticket called';
  }
  if (!service.currentCounter) {
    return service.currentCode;
  }
  return `${service.currentCode} at ${service.currentCounter}`;
}

function toTicketView(ticket) {
  if (!ticket) {
    return null;
  }

  const meta = statusMeta(ticket.status);
  const endedCaption = ticket.endedAt
    ? (ticket.status === 'served' ? 'Completed' : 'Closed')
    : '';

  return {
    ...ticket,
    statusLabel: meta.label,
    statusTone: meta.tone,
    statusClass: meta.className,
    isActive: meta.isActive,
    isWaiting: isWaiting(ticket),
    isAtDesk: isAtDesk(ticket),
    canStart: ticket.status === 'called',
    canServe: ticket.status === 'serving',
    canNoShow: ticket.status === 'called',
    canRecall: ticket.status === 'called',
    positionLabel: positionText(ticket),
    waitLabel: etaText(ticket),
    counterLabel: counterText(ticket),
    submittedLabel: dateTimeLabel(ticket.createdAt),
    calledLabel: clockLabel(ticket.calledAt),
    startedLabel: clockLabel(ticket.startedAt),
    servedLabel: clockLabel(ticket.endedAt),
    endedCaption,
  };
}

function toServiceView(service) {
  if (!service) {
    return null;
  }

  const isOpen = Boolean(service.isOpen);

  return {
    ...service,
    isOpen,
    openLabel: isOpen ? 'Open' : 'Closed',
    openClass: isOpen ? 'pill--open' : 'pill--closed',
    hoursLabel: serviceHoursLabel(service.opensAt, service.closesAt),
    openDaysLabel: openDaysLabel(service.openDays),
    waitingLabel: queueCountText(service.waitingCount),
    averageWaitLabel: `${Number(service.avgMinutes) || 0} min`,
    currentLabel: currentServingText(service),
  };
}

module.exports = {
  STATUS,
  ACTIVE_STATUSES,
  JOIN_CUTOFF_MINUTES,
  JOIN_COOLDOWN_SECONDS,
  MAX_ACTIVE_TICKETS,
  NO_SHOW_LIMIT,
  JOIN_MESSAGES,
  statusMeta,
  statusLabel,
  statusClass,
  statusTone,
  isOwner,
  canViewTicket,
  canLeave,
  canJoin,
  isWithinServiceWindow,
  evaluateJoinPolicy,
  isActiveStatus,
  isWaiting,
  isAtDesk,
  estimateWaitMinutes,
  positionText,
  etaText,
  queueCountText,
  toTicketView,
  toServiceView,
};
