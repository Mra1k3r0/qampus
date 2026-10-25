(function () {
  'use strict';

  const POLL_MS = 5000;
  const rows = Array.from(document.querySelectorAll('[data-display-service]'));
  const updatedLabel = document.querySelector('[data-display-updated-label]');
  const statusRegion = document.querySelector('[data-board-status]');
  const codeByService = new Map();

  let timer = null;
  let isFetching = false;
  let hasLoaded = false;

  function formatTime(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function findRow(code) {
    return rows.find(function (row) {
      return row.getAttribute('data-service-code') === code;
    }) || null;
  }

  function setText(element, value) {
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
  }

  function updateRow(service, announcements) {
    const row = findRow(service.code);
    if (!row) {
      return;
    }

    const codeElement = row.querySelector('[data-display-code]');
    const counterElement = row.querySelector('[data-display-counter-value]');
    const waitingElement = row.querySelector('[data-display-waiting]');

    const ticketCode = service.ticketCode || '';
    const previousCode = codeByService.get(service.code) || '';
    const isIdle = ticketCode.length === 0;

    if (codeElement) {
      const label = isIdle ? 'No ticket called' : ticketCode;
      if (codeElement.textContent !== label) {
        codeElement.textContent = label;
      }
      codeElement.classList.toggle('is-idle', isIdle);

      if (hasLoaded && ticketCode && previousCode !== ticketCode) {
        codeElement.classList.remove('is-updated');
        void codeElement.offsetWidth;
        codeElement.classList.add('is-updated');
        announcements.push(
          'Now serving ' + ticketCode + ' at ' + (service.counter || 'the window') + ', ' + service.name + '.',
        );
      }
    }

    setText(counterElement, service.counter || 'At the window');
    setText(waitingElement, String(service.waitingCount));

    codeByService.set(service.code, ticketCode);
  }

  function updateTime(board) {
    if (!updatedLabel) {
      return;
    }
    const iso = board.updatedAt;
    setText(updatedLabel, formatTime(iso) || 'just now');
    if (iso) {
      updatedLabel.setAttribute('datetime', iso);
    }
  }

  function announce(messages) {
    if (!statusRegion || messages.length === 0) {
      return;
    }
    statusRegion.textContent = messages.join(' ');
  }

  async function refresh() {
    if (isFetching || document.hidden) {
      return;
    }

    isFetching = true;
    try {
      const response = await fetch('/api/display', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Display request failed');
      }

      const board = await response.json();
      const announcements = [];
      const services = Array.isArray(board.services) ? board.services : [];

      services.forEach(function (service) {
        updateRow(service, announcements);
      });

      updateTime(board);
      announce(announcements);
      hasLoaded = true;
    } catch (error) {
      if (updatedLabel) {
        setText(updatedLabel, 'not available');
      }
    } finally {
      isFetching = false;
    }
  }

  function stop() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    stop();
    if (document.hidden) {
      return;
    }
    timer = window.setTimeout(tick, POLL_MS);
  }

  async function tick() {
    await refresh();
    schedule();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      return;
    }
    tick();
  });

  tick();
})();
