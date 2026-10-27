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

  const logoutDialog = document.querySelector('[data-logout-dialog]');
  const logoutForms = document.querySelectorAll('[data-logout-form]');
  let pendingLogoutForm = null;
  let logoutTrigger = null;

  function restoreLogoutFocus() {
    const trigger = logoutTrigger;
    logoutTrigger = null;
    if (!trigger || !document.contains(trigger)) {
      return;
    }
    window.requestAnimationFrame(function () {
      trigger.focus();
    });
  }

  function closeLogoutDialog() {
    if (!logoutDialog || !logoutDialog.open) {
      return;
    }
    logoutDialog.close();
    pendingLogoutForm = null;
    restoreLogoutFocus();
  }

  function openLogoutDialog(event) {
    const form = event.target;
    if (!logoutDialog || logoutDialog.open || typeof logoutDialog.showModal !== 'function') {
      return;
    }
    event.preventDefault();
    pendingLogoutForm = form;
    logoutTrigger = event.submitter || form.querySelector('button[type="submit"]');
    logoutDialog.showModal();
    const confirmButton = logoutDialog.querySelector('[data-logout-confirm]');
    if (confirmButton) {
      confirmButton.focus();
    }
  }

  function handleLogoutClick(event) {
    if (!logoutDialog) {
      return;
    }
    if (event.target === logoutDialog) {
      closeLogoutDialog();
      return;
    }
    if (event.target.closest('[data-logout-cancel]')) {
      closeLogoutDialog();
      return;
    }
    if (event.target.closest('[data-logout-confirm]') && pendingLogoutForm) {
      logoutDialog.close();
      pendingLogoutForm.submit();
    }
  }

  function keepLogoutFocus(event) {
    if (event.key !== 'Tab' || !logoutDialog || !logoutDialog.open) {
      return;
    }
    const focusable = logoutDialog.querySelectorAll('button:not([disabled])');
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleLogoutCancel(event) {
    event.preventDefault();
    closeLogoutDialog();
  }

  if (logoutDialog) {
    logoutForms.forEach(function (form) {
      form.addEventListener('submit', openLogoutDialog);
    });
    logoutDialog.addEventListener('click', handleLogoutClick);
    logoutDialog.addEventListener('keydown', keepLogoutFocus);
    logoutDialog.addEventListener('cancel', handleLogoutCancel);
  }

  document.addEventListener('click', dismissFlash);
  document.addEventListener('click', fillDemoAccount);
  document.addEventListener('click', handleMenuClose);
  document.addEventListener('click', closeMenuOnOutsideClick);
  document.addEventListener('keydown', closeMenuOnEscape);
  document.addEventListener('DOMContentLoaded', focusErrorSummary);
})();
