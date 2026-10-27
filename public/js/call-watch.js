(function () {
  'use strict';

  const POLL_MS = 10000;
  const CHIME_MS = 4000;
  const STORAGE_PREFIX = 'qampus.called.';
  const AUDIO_URL = '/audio/called.mp3';
  const DEFAULT_COUNTER = 'the counter';

  const root = document.querySelector('[data-call-watch]');

  if (!root) {
    return;
  }

  const statusUrl = root.getAttribute('data-status-url');
  const dialog = root.querySelector('[data-call-dialog]');
  const codeNode = root.querySelector('[data-call-code]');
  const serviceNode = root.querySelector('[data-call-service]');
  const counterNode = root.querySelector('[data-call-counter]');
  const openLink = root.querySelector('[data-call-open]');
  const dismissButton = root.querySelector('[data-call-dismiss]');

  if (!statusUrl || !dialog) {
    return;
  }

  const memoryCounts = new Map();
  let pollTimer = null;
  let isFetching = false;
  let activeTicket = null;
  let audioContext = null;
  let audioBuffer = null;
  let isLoadingAudio = false;
  let chimeTimer = null;

  function ignore() {}

  function storageKey(ticketId) {
    return STORAGE_PREFIX + ticketId;
  }

  function readStoredCount(ticketId) {
    const key = storageKey(ticketId);
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        return stored;
      }
    } catch {
      // Storage can be blocked, so fall back to memory for this page.
    }
    return memoryCounts.has(key) ? memoryCounts.get(key) : null;
  }

  function storeCount(ticketId, callCount) {
    const key = storageKey(ticketId);
    const value = String(callCount);
    memoryCounts.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be blocked, so the in-memory value still prevents repeats.
    }
  }

  function normalizeTicket(ticket) {
    if (!ticket || ticket.id === null || ticket.id === undefined) {
      return null;
    }
    const callCount = Number(ticket.callCount);
    return {
      id: String(ticket.id),
      code: typeof ticket.code === 'string' ? ticket.code : '',
      serviceName: typeof ticket.serviceName === 'string' ? ticket.serviceName : '',
      counterName: typeof ticket.counterName === 'string' ? ticket.counterName : '',
      status: typeof ticket.status === 'string' ? ticket.status : '',
      callCount: Number.isFinite(callCount) ? callCount : 0,
    };
  }

  function setText(node, text) {
    if (node) {
      node.textContent = text;
    }
  }

  function populateDialog(ticket) {
    setText(codeNode, ticket.code);
    setText(serviceNode, ticket.serviceName);
    setText(counterNode, ticket.counterName || DEFAULT_COUNTER);
    if (openLink) {
      openLink.href = '/queue/tickets/' + encodeURIComponent(ticket.id);
    }
  }

  function stopChime() {
    if (chimeTimer !== null) {
      window.clearInterval(chimeTimer);
      chimeTimer = null;
    }
  }

  function playChime() {
    if (!audioContext || !audioBuffer) {
      return;
    }
    if (audioContext.state === 'suspended') {
      const resumed = audioContext.resume();
      if (resumed && typeof resumed.catch === 'function') {
        resumed.catch(ignore);
      }
    }
    try {
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
    } catch {
      // Audio can fail on some devices; the dialog still carries the call.
    }
  }

  function startChime() {
    if (!audioBuffer || chimeTimer !== null) {
      return;
    }
    playChime();
    chimeTimer = window.setInterval(playChime, CHIME_MS);
  }

  function maybeStartChime() {
    if (dialog.open && activeTicket && audioBuffer) {
      startChime();
    }
  }

  async function loadAudio() {
    if (!audioContext || audioBuffer || isLoadingAudio) {
      return;
    }
    isLoadingAudio = true;
    try {
      const response = await fetch(AUDIO_URL, {
        cache: 'force-cache',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        return;
      }
      const data = await response.arrayBuffer();
      if (!audioContext) {
        return;
      }
      audioBuffer = await audioContext.decodeAudioData(data);
    } catch {
      // Sound is optional; a failed fetch or decode must not break the dialog.
    } finally {
      isLoadingAudio = false;
    }
  }

  function unlockAudio() {
    document.removeEventListener('pointerdown', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);

    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioConstructor) {
      return;
    }

    if (!audioContext) {
      try {
        audioContext = new AudioConstructor();
      } catch {
        return;
      }
    }

    const resumed = audioContext.resume();
    if (resumed && typeof resumed.then === 'function') {
      resumed
        .then(loadAudio)
        .then(maybeStartChime)
        .catch(ignore);
      return;
    }

    loadAudio().then(maybeStartChime).catch(ignore);
  }

  function handleDialogClose() {
    stopChime();
    if (activeTicket) {
      storeCount(activeTicket.id, activeTicket.callCount);
      activeTicket = null;
    }
  }

  function closeDialog() {
    if (dialog.open) {
      try {
        dialog.close();
        return;
      } catch {
        // Fall through to the manual cleanup below.
      }
    }
    if (activeTicket) {
      handleDialogClose();
    }
  }

  function showTicket(ticket) {
    if (typeof dialog.showModal !== 'function') {
      return;
    }
    activeTicket = ticket;
    populateDialog(ticket);
    if (dialog.open) {
      maybeStartChime();
      return;
    }
    try {
      dialog.showModal();
    } catch {
      activeTicket = null;
      return;
    }
    maybeStartChime();
  }

  function ticketNeedsCall(ticket) {
    if (ticket.status !== 'called') {
      return false;
    }
    const stored = readStoredCount(ticket.id);
    return stored === null || stored !== String(ticket.callCount);
  }

  function syncActiveTicket(tickets) {
    if (!activeTicket) {
      return;
    }
    const latest = tickets.find(function (ticket) {
      return ticket.id === activeTicket.id;
    });
    if (!latest || latest.status !== 'called') {
      closeDialog();
      return;
    }
    activeTicket = latest;
    populateDialog(latest);
  }

  function handleTickets(tickets) {
    syncActiveTicket(tickets);

    tickets.forEach(function (ticket) {
      if (activeTicket && activeTicket.id === ticket.id) {
        return;
      }
      if (!activeTicket && ticketNeedsCall(ticket)) {
        showTicket(ticket);
        return;
      }
      if (!ticketNeedsCall(ticket)) {
        storeCount(ticket.id, ticket.callCount);
      }
    });
  }

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll() {
    stopPolling();
    if (document.hidden) {
      return;
    }
    pollTimer = window.setTimeout(function () {
      poll().catch(ignore);
    }, POLL_MS);
  }

  async function poll() {
    if (isFetching || document.hidden) {
      return;
    }
    isFetching = true;
    try {
      const response = await fetch(statusUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      const rawTickets = data && Array.isArray(data.tickets) ? data.tickets : [];
      const tickets = rawTickets.map(normalizeTicket).filter(Boolean);
      handleTickets(tickets);
    } catch {
      // A failed poll is retried on the next interval.
    } finally {
      isFetching = false;
      schedulePoll();
    }
  }

  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  dialog.addEventListener('close', handleDialogClose);

  if (dismissButton) {
    dismissButton.addEventListener('click', closeDialog);
  }

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
      return;
    }
    poll().catch(ignore);
  });

  poll().catch(ignore);
})();
