(function () {
  'use strict';

  const POLL_MS = 10000;
  const SOUND_STORAGE_KEY = 'cspc.queue.sound';
  const statusRegion = document.querySelector('[data-live-status]');
  const soundPanel = document.querySelector('[data-sound-panel]');
  const soundAudio = document.querySelector('[data-called-sound]');
  const soundToggle = document.querySelector('[data-sound-toggle]');
  const soundLabel = document.querySelector('[data-sound-label]');
  let region = document.querySelector('[data-live-region]');

  if (!region) {
    return;
  }

  let timer = null;
  let isFetching = false;
  let hasFailed = false;
  let callCount = readCallCount(region);
  let isSoundOn = readSoundPreference();
  let isSoundUnlocked = false;

  function readCallCount(node) {
    const count = Number.parseInt(node.getAttribute('data-call-count'), 10);
    return Number.isFinite(count) ? count : 0;
  }

  function readSoundPreference() {
    try {
      return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function storeSoundPreference(isOn) {
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, isOn ? 'on' : 'off');
    } catch {
      // Storage can be blocked, so the choice only holds for this page.
    }
  }

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

  function syncSoundToggle() {
    if (!soundToggle || !soundLabel) {
      return;
    }
    soundToggle.setAttribute('aria-pressed', isSoundOn ? 'true' : 'false');
    soundLabel.textContent = isSoundOn ? 'Sound on' : 'Sound off';
  }

  function markSoundBlocked() {
    isSoundOn = false;
    if (soundToggle) {
      soundToggle.setAttribute('aria-pressed', 'false');
    }
    if (soundLabel) {
      soundLabel.textContent = 'Turn on sound';
    }
    announce('Sound is blocked until you turn it on.');
  }

  function playCalledSound() {
    if (!soundAudio || !isSoundOn) {
      return;
    }
    soundAudio.muted = false;
    soundAudio.currentTime = 0;
    const attempt = soundAudio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(markSoundBlocked);
    }
  }

  function unlockSound() {
    if (!soundAudio || isSoundUnlocked) {
      return;
    }
    isSoundUnlocked = true;
    document.removeEventListener('pointerdown', unlockSound);
    document.removeEventListener('keydown', unlockSound);
    soundAudio.muted = true;

    const attempt = soundAudio.play();
    if (!attempt || typeof attempt.then !== 'function') {
      soundAudio.muted = false;
      return;
    }

    attempt
      .then(function () {
        if (soundAudio.muted) {
          soundAudio.pause();
          soundAudio.currentTime = 0;
        }
        soundAudio.muted = false;
      })
      .catch(function () {
        soundAudio.muted = false;
      });
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
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const nextRegion = parsed.querySelector('[data-live-region]');

      if (nextRegion && nextRegion.innerHTML !== region.innerHTML) {
        const nextCallCount = readCallCount(nextRegion);
        const wasCalled = nextCallCount > callCount;
        callCount = nextCallCount;
        region.replaceWith(nextRegion);
        region = nextRegion;

        if (wasCalled) {
          playCalledSound();
          announce('Your ticket was called. Check the counter on this page.');
        } else {
          announce('Queue updated at ' + formatTime(new Date()) + '.');
        }
      }
      hasFailed = false;
    } catch (error) {
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

  function enableSound() {
    if (!soundPanel || !soundAudio || !soundToggle || !soundLabel) {
      return;
    }

    soundPanel.removeAttribute('hidden');
    syncSoundToggle();

    soundToggle.addEventListener('click', function () {
      isSoundOn = !isSoundOn;
      storeSoundPreference(isSoundOn);
      syncSoundToggle();
      if (isSoundOn) {
        playCalledSound();
      }
    });

    document.addEventListener('pointerdown', unlockSound);
    document.addEventListener('keydown', unlockSound);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      return;
    }
    tick();
  });

  enableSound();
  tick();
})();
