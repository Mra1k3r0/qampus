(function () {
  'use strict';

  const POLL_MS = 10000;
  const statusRegion = document.querySelector('[data-live-status]');
  let region = document.querySelector('[data-live-region]');

  if (!region) {
    return;
  }

  let timer = null;
  let isFetching = false;
  let hasFailed = false;
  let status = region.getAttribute('data-ticket-status') || '';

  function formatTime(date) {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function announce(message, isError) {
    if (!statusRegion) {
      return;
    }
    if (isError && hasFailed) {
      return;
    }
    statusRegion.textContent = message;
    hasFailed = Boolean(isError);
  }

  function hasFocusInside() {
    const active = document.activeElement;
    return Boolean(active && active !== document.body && region.contains(active));
  }

  async function refresh() {
    if (isFetching || document.hidden || hasFocusInside()) {
      return;
    }

    isFetching = true;
    region.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(window.location.pathname + window.location.search, {
        headers: { Accept: 'text/html' },
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Queue request failed');
      }

      const html = await response.text();
      const trusted = window.qampusTrustedHtml ? window.qampusTrustedHtml(html) : html;
      const parsed = new DOMParser().parseFromString(trusted, 'text/html');
      const nextRegion = parsed.querySelector('[data-live-region]');

      if (nextRegion) {
        const nextStatus = nextRegion.getAttribute('data-ticket-status') || '';
        const wasCalled = nextStatus === 'called' && status !== 'called';
        const hasChanged = nextRegion.innerHTML !== region.innerHTML;
        status = nextStatus;

        if (hasChanged) {
          region.replaceWith(nextRegion);
          region = nextRegion;
        }

        if (wasCalled) {
          announce('Your ticket was called.');
        } else if (hasChanged) {
          announce('Queue updated at ' + formatTime(new Date()) + '.');
        }
      }
      hasFailed = false;
    } catch {
      announce('Could not update the queue. Refresh the page to try again.', true);
    } finally {
      isFetching = false;
      if (region.isConnected) {
        region.removeAttribute('aria-busy');
      }
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
