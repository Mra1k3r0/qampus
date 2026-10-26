const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TIME_ZONE = 'Asia/Manila';
const WEEKDAY_LABEL = 'Monday to Friday';
const WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

function toManila(value = new Date()) {
  return dayjs(value).tz(TIME_ZONE);
}

function isValid(value) {
  return dayjs(value).isValid();
}

function formatInManila(value, template) {
  if (!value || !isValid(value)) {
    return '';
  }
  return toManila(value).format(template);
}

function serviceDate(value = new Date()) {
  return toManila(value).format('YYYY-MM-DD');
}

function parseClockMinutes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > HOURS_PER_DAY || minutes >= MINUTES_PER_HOUR) {
    return null;
  }
  return hours * MINUTES_PER_HOUR + minutes;
}

function manilaNowParts(value = new Date()) {
  const now = toManila(value);
  return {
    weekday: now.format('ddd'),
    minutes: now.hour() * MINUTES_PER_HOUR + now.minute(),
  };
}

function nowIso() {
  return dayjs().toISOString();
}

function serviceDateLabel(value = new Date()) {
  return formatInManila(value, 'dddd, MMMM D');
}

function clockLabel(value) {
  return formatInManila(value, 'h:mm A');
}

function formatTime(value = new Date()) {
  return clockLabel(value);
}

function dateTimeLabel(value) {
  return formatInManila(value, 'MMM D, h:mm A');
}

function monthYearLabel(value) {
  return formatInManila(value, 'MMMM YYYY');
}

function formatDateTime(value = new Date()) {
  return formatInManila(value, 'MMM D, YYYY h:mm A');
}

function serviceHoursLabel(opensAt, closesAt) {
  if (!opensAt || !closesAt) {
    return '';
  }
  return `${opensAt} to ${closesAt} PHT`;
}

function relativeUpdatedLabel(value, reference = new Date()) {
  if (!value || !isValid(value) || !reference || !isValid(reference)) {
    return 'just now';
  }

  const seconds = Math.max(0, dayjs(reference).diff(dayjs(value), 'second'));
  if (seconds < SECONDS_PER_MINUTE) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    const suffix = minutes === 1 ? '' : 's';
    return `${minutes} minute${suffix} ago`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    const suffix = hours === 1 ? '' : 's';
    return `${hours} hour${suffix} ago`;
  }

  return dateTimeLabel(value);
}

function openDaysLabel(openDays) {
  let days = openDays;
  if (typeof days === 'string') {
    try {
      days = JSON.parse(days);
    } catch {
      return WEEKDAY_LABEL;
    }
  }

  if (!Array.isArray(days) || days.length === 0) {
    return WEEKDAY_LABEL;
  }

  const isWeekdays = days.length === WEEKDAYS.length
    && WEEKDAYS.every((day, index) => days[index] === day);
  return isWeekdays ? WEEKDAY_LABEL : days.join(', ');
}

module.exports = {
  TIME_ZONE,
  serviceDate,
  parseClockMinutes,
  manilaNowParts,
  nowIso,
  serviceDateLabel,
  clockLabel,
  formatTime,
  dateTimeLabel,
  monthYearLabel,
  formatDateTime,
  serviceHoursLabel,
  relativeUpdatedLabel,
  openDaysLabel,
};
