(function () {
  'use strict';

  const CLIENT_ERROR_ID = 'password-client-error';

  function fieldLabel(input) {
    const label = input.labels && input.labels[0];
    return label ? label.textContent.trim().toLowerCase() : 'password';
  }

  function setupPasswordToggle(button) {
    const targetId = button.getAttribute('data-password-toggle');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input || input.type !== 'password') {
      return;
    }

    const label = fieldLabel(input);
    const showLabel = 'Show ' + label;
    const hideLabel = 'Hide ' + label;
    const showIcon = button.querySelector('[data-password-icon="show"]');
    const hideIcon = button.querySelector('[data-password-icon="hide"]');

    function render(isVisible) {
      input.type = isVisible ? 'text' : 'password';
      button.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
      button.setAttribute('aria-label', isVisible ? hideLabel : showLabel);
      if (showIcon) {
        showIcon.hidden = isVisible;
      }
      if (hideIcon) {
        hideIcon.hidden = !isVisible;
      }
    }

    button.hidden = false;
    render(false);

    button.addEventListener('click', function () {
      render(input.type === 'password');
    });
  }

  document.querySelectorAll('[data-password-toggle]').forEach(setupPasswordToggle);

  const form = document.querySelector('form[action="/register"]');
  if (!form) {
    return;
  }

  const input = form.querySelector('#password');
  const error = form.querySelector('#password-client-error');
  if (!input || !error) {
    return;
  }

  function isPasswordValid(value) {
    return value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
  }

  function describedByIds() {
    return (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  }

  function showClientError() {
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');

    const ids = describedByIds();
    if (!ids.includes(CLIENT_ERROR_ID)) {
      ids.push(CLIENT_ERROR_ID);
      input.setAttribute('aria-describedby', ids.join(' '));
    }
  }

  function clearClientError() {
    error.hidden = true;
    input.removeAttribute('aria-invalid');

    const ids = describedByIds().filter((id) => id !== CLIENT_ERROR_ID);
    if (ids.length > 0) {
      input.setAttribute('aria-describedby', ids.join(' '));
      return;
    }
    input.removeAttribute('aria-describedby');
  }

  form.addEventListener('submit', (event) => {
    if (isPasswordValid(input.value)) {
      clearClientError();
      return;
    }
    event.preventDefault();
    showClientError();
    input.focus();
  });

  input.addEventListener('input', () => {
    if (isPasswordValid(input.value)) {
      clearClientError();
    }
  });
})();
