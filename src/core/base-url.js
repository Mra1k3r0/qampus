const HOST_PATTERN = /^[a-z0-9.-]+(:[0-9]+)?$/i;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function firstHeaderValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(',')[0].trim();
}

function hostnameOf(host) {
  return host.replace(/:[0-9]+$/, '').toLowerCase();
}

function isLocalHost(host) {
  return LOCAL_HOSTNAMES.has(hostnameOf(host));
}

function isLocalBaseUrl(baseUrl) {
  try {
    const withScheme = baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`;
    return isLocalHost(new URL(withScheme).host);
  } catch {
    return false;
  }
}

function normalizeProtocol(value) {
  const protocol = String(value || '').toLowerCase();
  return protocol === 'http' || protocol === 'https' ? protocol : '';
}

function deriveBaseUrl(req, config) {
  const forwardedHost = firstHeaderValue(req.get('x-forwarded-host'));
  const host = forwardedHost || req.get('host') || '';

  if (!HOST_PATTERN.test(host)) {
    return null;
  }

  let protocol = normalizeProtocol(firstHeaderValue(req.get('x-forwarded-proto')))
    || normalizeProtocol(req.protocol)
    || 'http';

  if (config.isProduction) {
    protocol = isLocalHost(host) ? 'http' : 'https';
  }

  return `${protocol}://${host}`;
}

function resolvePublicBaseUrl(req, config) {
  const configured = normalizeBaseUrl(config && config.publicBaseUrl);

  try {
    if (configured && !isLocalBaseUrl(configured)) {
      return configured;
    }

    return deriveBaseUrl(req, config) || configured;
  } catch {
    return configured;
  }
}

module.exports = {
  resolvePublicBaseUrl,
};
