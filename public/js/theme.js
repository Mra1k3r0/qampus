(function () {
  'use strict';

  const STORAGE_KEY = 'qampus.theme';
  const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
  const THEMES = ['light', 'dark', 'midnight'];
  const MIDNIGHT_CLICKS = 5;
  const MIDNIGHT_WINDOW = 2000;
  const MIDNIGHT_HOLD = 1200;
  const THEME_LABELS = {
    light: 'Light',
    dark: 'Dark',
    midnight: 'Midnight',
  };
  const THEME_META_COLORS = {
    light: '#F7F4EC',
    dark: '#0E1626',
    midnight: '#000000',
  };
  const REVEAL_DURATION = 600;
  const REVEAL_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
  const SWITCHING_CLASS = 'is-theme-switching';
  const root = document.documentElement;
  let currentTheme = 'light';
  let activeTransition = null;
  let recentClicks = [];
  let midnightHoldUntil = 0;

  function isTheme(value) {
    return THEMES.includes(value);
  }

  function readStoredTheme() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isTheme(stored)) {
        return stored;
      }
    } catch {
      return null;
    }
    return null;
  }

  function persistTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      return;
    }
  }

  function systemTheme() {
    try {
      return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function nextTheme(theme) {
    if (theme === 'midnight') {
      return 'light';
    }
    return theme === 'dark' ? 'light' : 'dark';
  }

  function shouldRevealMidnight() {
    const now = Date.now();
    recentClicks = recentClicks.filter(function (time) {
      return now - time <= MIDNIGHT_WINDOW;
    });
    recentClicks.push(now);

    if (recentClicks.length < MIDNIGHT_CLICKS) {
      return false;
    }

    recentClicks = [];
    return true;
  }

  function updateMetaColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', THEME_META_COLORS[theme]);
    }
  }

  function updateToggles(theme) {
    const next = nextTheme(theme);
    const ariaLabel = 'Current theme: ' + THEME_LABELS[theme] + '. Activate to switch to ' + THEME_LABELS[next] + '.';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      const label = button.querySelector('[data-theme-label]');
      if (label) {
        label.textContent = THEME_LABELS[theme];
      }
      button.setAttribute('aria-label', ariaLabel);
    });
  }

  function applyTheme(theme) {
    currentTheme = theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'midnight' ? 'dark' : theme;
    updateMetaColor(theme);
    updateToggles(theme);
  }

  function revealOrigin(button, event) {
    const rect = button ? button.getBoundingClientRect() : null;
    const centerX = rect ? rect.left + (rect.width / 2) : window.innerWidth / 2;
    const centerY = rect ? rect.top + (rect.height / 2) : window.innerHeight / 2;
    const hasPointer = event && event.detail > 0;
    const x = hasPointer ? event.clientX : centerX;
    const y = hasPointer ? event.clientY : centerY;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    return { x, y, radius };
  }

  function saveTheme(theme) {
    applyTheme(theme);
    persistTheme(theme);
  }

  function startSwitch() {
    root.classList.add(SWITCHING_CLASS);
  }

  function finishSwitch() {
    root.classList.remove(SWITCHING_CLASS);
  }

  function saveThemeWithoutTransition(theme) {
    startSwitch();
    saveTheme(theme);
    // Flush the new colours while transitions are off, so the switch cannot animate.
    void root.offsetWidth;
    finishSwitch();
  }

  function changeTheme(event) {
    if (Date.now() < midnightHoldUntil) {
      return;
    }

    const revealMidnight = shouldRevealMidnight() && currentTheme !== 'midnight';

    if (revealMidnight) {
      midnightHoldUntil = Date.now() + MIDNIGHT_HOLD;
    }

    currentTheme = revealMidnight ? 'midnight' : nextTheme(currentTheme);

    const button = event && event.currentTarget;
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const canAnimate = typeof document.startViewTransition === 'function' && !reducedMotion;

    if (!canAnimate || (activeTransition && !revealMidnight)) {
      saveThemeWithoutTransition(currentTheme);
      return;
    }

    const origin = revealOrigin(button, event);
    let transition;

    startSwitch();

    try {
      transition = document.startViewTransition(function () {
        saveTheme(currentTheme);
      });
    } catch {
      finishSwitch();
      saveThemeWithoutTransition(currentTheme);
      return;
    }

    activeTransition = transition;

    transition.ready
      .then(function () {
        finishSwitch();
        root.animate(
          {
            clipPath: [
              'circle(0px at ' + origin.x + 'px ' + origin.y + 'px)',
              'circle(' + origin.radius + 'px at ' + origin.x + 'px ' + origin.y + 'px)',
            ],
          },
          {
            duration: REVEAL_DURATION,
            easing: REVEAL_EASING,
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(function () {});

    transition.finished
      .catch(function () {})
      .finally(function () {
        finishSwitch();
        if (activeTransition === transition) {
          activeTransition = null;
        }
      });
  }

  function toggleAtPoint(x, y) {
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    for (const button of toggles) {
      const rect = button.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return button;
      }
    }
    return null;
  }

  // The view transition snapshot swallows pointer clicks, so route toggle clicks by position.
  function forwardThemeClick(event) {
    if (!activeTransition) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('[data-theme-toggle]')) {
      return;
    }
    const button = toggleAtPoint(event.clientX, event.clientY);
    if (button) {
      button.click();
    }
  }

  function wireToggles() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.addEventListener('click', changeTheme);
    });
    document.addEventListener('click', forwardThemeClick);
    updateToggles(currentTheme);
    updateMetaColor(currentTheme);
  }

  applyTheme(readStoredTheme() || systemTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggles);
  } else {
    wireToggles();
  }
})();
