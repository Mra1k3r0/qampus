(function () {
  'use strict';

  function trustedHtml(value) {
    if (!window.trustedTypes || typeof window.trustedTypes.createPolicy !== 'function') {
      return value;
    }
    if (!window.qampusHtmlPolicy) {
      // The HTML comes from this origin's own live-region response.
      window.qampusHtmlPolicy = window.trustedTypes.createPolicy('qampus-html', {
        createHTML: function (input) {
          return input;
        },
      });
    }
    return window.qampusHtmlPolicy.createHTML(value);
  }

  window.qampusTrustedHtml = trustedHtml;

  function dismissFlash(event) {
    const button = event.target.closest('[data-dismiss-flash]');
    if (!button) {
      return;
    }
    const flash = button.closest('[data-flash]');
    if (flash) {
      flash.remove();
    }
  }

  function focusErrorSummary() {
    const summary = document.querySelector('[data-error-summary]');
    if (summary) {
      summary.focus();
    }
  }

  function fillDemoAccount(event) {
    const button = event.target.closest('[data-demo-fill]');
    if (!button) {
      return;
    }
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    if (!email || !password) {
      return;
    }
    email.value = button.getAttribute('data-email') || '';
    password.value = button.getAttribute('data-password') || '';
    password.focus();
  }

  const MENU_CLOSE_MS = 160;

  function finishMenuClose(menu, restoreFocus) {
    menu.removeAttribute('open');
    menu.classList.remove('is-closing');
    if (restoreFocus) {
      const summary = menu.querySelector('summary');
      if (summary) {
        summary.focus();
      }
    }
  }

  function closeMenu(menu, restoreFocus) {
    if (!menu || !menu.hasAttribute('open') || menu.classList.contains('is-closing')) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      finishMenuClose(menu, restoreFocus);
      return;
    }

    menu.classList.add('is-closing');
    window.setTimeout(function () {
      finishMenuClose(menu, restoreFocus);
    }, MENU_CLOSE_MS);
  }

  function handleMenuClose(event) {
    const button = event.target.closest('[data-close-menu]');
    if (button) {
      closeMenu(button.closest('.mobile-menu'), true);
    }
  }

  function closeMenuOnEscape(event) {
    if (event.key !== 'Escape') {
      return;
    }
    document.querySelectorAll('.mobile-menu[open]').forEach(function (menu) {
      closeMenu(menu, true);
    });
  }

  function closeMenuOnOutsideClick(event) {
    document.querySelectorAll('.mobile-menu[open]').forEach(function (menu) {
      if (menu.classList.contains('is-closing') || event.target.closest('summary')) {
        return;
      }
      const panel = menu.querySelector('.mobile-menu__panel');
      if (!panel || !panel.contains(event.target)) {
        closeMenu(menu, false);
      }
    });
  }

  document.addEventListener('click', dismissFlash);
  document.addEventListener('click', fillDemoAccount);
  document.addEventListener('click', handleMenuClose);
  document.addEventListener('click', closeMenuOnOutsideClick);
  document.addEventListener('keydown', closeMenuOnEscape);
  document.addEventListener('DOMContentLoaded', focusErrorSummary);
})();
