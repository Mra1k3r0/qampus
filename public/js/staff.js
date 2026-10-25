(function () {
  'use strict';

  const POLL_MS = 5000;
  const statusRegion = document.querySelector('[data-live-status]');
  let region = document.querySelector('[data-live-region]');

  if (!region) {
    return;
  }

  const pollUrl = region.getAttribute('data-live-url') || '/staff/queue';
  let timer = null;
  let isFetching = false;
  let hasFailed = false;

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
      const response = await fetch(pollUrl, {
        headers: { Accept: 'text/html' },
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Staff queue request failed');
      }

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const nextRegion = parsed.querySelector('[data-live-region]');

      if (nextRegion && nextRegion.innerHTML !== region.innerHTML) {
        region.replaceWith(nextRegion);
        region = nextRegion;
        announce('Staff queue updated at ' + formatTime(new Date()) + '.');
      }
      hasFailed = false;
    } catch (error) {
      announce('Could not update the staff queue. Refresh the page to try again.', true);
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
