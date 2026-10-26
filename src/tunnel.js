const { spawn: nodeSpawn, execFile } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { pipeline } = require('node:stream/promises');

const PINNED_VERSION = '2026.10.4';
const READINESS_TIMEOUT_MS = 30_000;
const HEALTH_GATE_ATTEMPTS = 10;
const HEALTH_GATE_INTERVAL_MS = 1000;
const HEALTH_PROBE_TIMEOUT_MS = 1000;
const MIN_BINARY_BYTES = 1_000_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, 'g');
const TRY_URL_RE = /https:\/\/[^\s"'<>]+\.trycloudflare\.com[^\s"'<>]*/i;
const REGISTERED_RE = /registered tunnel connection/i;
const FAILURE_RE = /(critical|panic|crash|failed|unable|cannot|denied|refused|fatal\b|error)/i;
const INF_SETTINGS_RE = /INF Settings:/i;
const INF_SETTINGS_FAILURE_RE = /(failed|unable|cannot|denied|refused|panic|crash|error)/i;
const CONFIG_PATH_HINT_RE = /cannot determine default configuration path/i;
const CONFIG_FILE_RE = /config.ya?ml/i;
const ORIGIN_CERT_RE = /cannot determine default origin certificate path/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseEnabled(raw) {
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function isTunnelEnabled(env = process.env) {
  return parseEnabled(env.TUNNEL ?? env.CLOUDFLARED_ENABLED);
}

function resolveVersion(raw) {
  if (!raw || raw.trim() === '') return { version: PINNED_VERSION, usedLatest: false };
  if (raw.trim().toLowerCase() === 'latest') return { version: 'latest', usedLatest: true };
  return { version: raw.trim().replace(/^v/, ''), usedLatest: false };
}

function parseExtraArgs(raw) {
  if (!raw || raw.trim() === '') return [];
  return raw.split(/\s+/).filter(Boolean);
}

function artifactForPlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    if (arch === 'x64') return { name: 'cloudflared-windows-amd64.exe', needsChmod: false };
    if (arch === 'arm64') return { name: 'cloudflared-windows-arm64.exe', needsChmod: false };
    return null;
  }
  if (platform === 'linux') {
    if (arch === 'x64') return { name: 'cloudflared-linux-amd64', needsChmod: true };
    if (arch === 'arm64') return { name: 'cloudflared-linux-arm64', needsChmod: true };
    return null;
  }
  if (platform === 'darwin') {
    if (arch === 'arm64') return { name: 'cloudflared-darwin-arm64', needsChmod: true };
    if (arch === 'x64') return { name: 'cloudflared-darwin-amd64', needsChmod: true };
    return null;
  }
  return null;
}

function downloadUrl(version, asset) {
  const tag = version === 'latest' ? 'latest' : version;
  return `https://github.com/cloudflare/cloudflared/releases/download/${tag}/${asset}`;
}

function cacheDir(home = os.homedir(), platform = process.platform) {
  if (process.env.CLOUDFLARED_CACHE_DIR) return process.env.CLOUDFLARED_CACHE_DIR;
  if (platform === 'win32') {
    const base = process.env.LOCALAPPDATA ?? home;
    return path.join(base, 'qampus', 'bin');
  }
  return path.join(home, '.cache', 'qampus', 'bin');
}

function cachedBinaryPath(version, asset, dir) {
  return path.join(dir ?? cacheDir(), version, asset);
}

function stripAnsi(value) {
  return value.replace(ANSI_RE, '').replaceAll('\x1B', '');
}

function extractUrl(line) {
  const match = stripAnsi(line).match(TRY_URL_RE);
  return match ? match[0] : null;
}

function extractIngressHost(line) {
  const cleaned = stripAnsi(line);
  if (!/new configuration|ingress/i.test(cleaned)) return null;
  const host = cleaned.match(/\\?"hostname\\?"\s*:\s*\\?"([^"\\]+)\\?"/)?.[1];
  if (!host || !host.includes('.')) return null;
  const service = cleaned.match(/\\?"service\\?"\s*:\s*\\?"([^"\\]+)\\?"/)?.[1] ?? null;
  return { hostname: host, service };
}

function tunnelChildEnv(env = process.env) {
  return {
    ...env,
    QUIC_GO_DISABLE_RECEIVE_BUFFER_WARNING: env.QUIC_GO_DISABLE_RECEIVE_BUFFER_WARNING ?? 'true',
  };
}

function isSameLocalService(actual, expected) {
  const parse = (raw) => {
    try {
      const url = new URL(raw);
      return {
        host: LOOPBACK_HOSTS.has(url.hostname) ? 'loopback' : url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        path: url.pathname.replace(/\/+$/, ''),
      };
    } catch {
      return null;
    }
  };
  const left = parse(actual);
  const right = parse(expected);
  return Boolean(left && right && left.host === right.host && left.port === right.port
    && left.path === right.path);
}

function classifyLine(line) {
  const cleaned = stripAnsi(line).trim();
  if (!cleaned) return 'ignore';
  if (CONFIG_PATH_HINT_RE.test(cleaned) && CONFIG_FILE_RE.test(cleaned)) return 'ignore';
  if (ORIGIN_CERT_RE.test(cleaned)) return 'ignore';
  if (INF_SETTINGS_RE.test(cleaned) && !INF_SETTINGS_FAILURE_RE.test(cleaned)) return 'ignore';
  if (FAILURE_RE.test(cleaned)) return 'error';
  return null;
}

function isRegisteredLine(line) {
  return REGISTERED_RE.test(stripAnsi(line));
}

function buildArgs(opts) {
  const extra = opts.extra ?? [];
  if (opts.token) {
    return ['--no-autoupdate', 'tunnel', 'run', '--token', opts.token, ...extra];
  }
  return [
    '--no-autoupdate',
    'tunnel',
    '--url',
    `http://127.0.0.1:${opts.port}`,
    '--transport-loglevel',
    'fatal',
    ...extra,
  ];
}

function maskArgs(args) {
  const masked = [...args];
  const index = masked.indexOf('--token');
  if (index >= 0 && index + 1 < masked.length) masked[index + 1] = '<redacted>';
  return masked;
}

function downloadToFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400
        && response.headers.location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error(`too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(response.headers.location, url).href;
        downloadToFile(nextUrl, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      pipeline(response, createWriteStream(destination)).then(resolve, reject);
    });
    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`download timed out for ${url}`));
    });
    request.on('error', reject);
  });
}

async function ensureBinary(opts) {
  if (opts.binOverride) return opts.binOverride;
  const artifact = artifactForPlatform();
  if (!artifact) {
    throw new Error(
      `Unsupported OS or architecture: ${process.platform} ${process.arch}. `
      + 'Install cloudflared manually and set CLOUDFLARED_BIN.',
    );
  }
  const destination = cachedBinaryPath(opts.version, artifact.name);
  try {
    const stat = await fs.stat(destination);
    if (stat.size > MIN_BINARY_BYTES) {
      if (artifact.needsChmod) await fs.chmod(destination, 0o755);
      return destination;
    }
  } catch {
    // missing cache, download below
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  await downloadToFile(downloadUrl(opts.version, artifact.name), temporary);
  const stat = await fs.stat(temporary);
  if (stat.size <= MIN_BINARY_BYTES) {
    throw new Error(`Downloaded cloudflared failed its size check (${stat.size} bytes)`);
  }
  if (artifact.needsChmod) await fs.chmod(temporary, 0o755);
  await fs.rename(temporary, destination);
  return destination;
}

async function probeLocalhost(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function subscribeLines(stream, onLine) {
  if (stream && typeof stream.resume === 'function') {
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    reader.on('line', onLine);
    return;
  }
  if (stream && typeof stream.on === 'function') {
    stream.on('line', onLine);
  }
}

async function startTunnel(opts) {
  const {
    port,
    token,
    timeoutMs = READINESS_TIMEOUT_MS,
    healthAttempts = HEALTH_GATE_ATTEMPTS,
    healthIntervalMs = HEALTH_GATE_INTERVAL_MS,
    onLog = () => {},
    onWarn = () => {},
    spawn = (binary, args) => nodeSpawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: tunnelChildEnv(),
    }),
    ensure = ensureBinary,
    probe = probeLocalhost,
    platform = process.platform,
  } = opts;

  const redact = (value) => (token ? value.split(token).join('<redacted>') : value);
  const { version, usedLatest } = resolveVersion(opts.version);
  if (usedLatest) onWarn('[tunnel] CLOUDFLARED_VERSION=latest is not reproducible; pin a release');
  if (opts.hostname) onLog(`[tunnel] expected hostname: ${opts.hostname}`);

  const localUrl = `http://127.0.0.1:${port}`;
  onLog(`[tunnel] exposing ${localUrl}`);

  let reachable = false;
  for (let attempt = 1; attempt <= healthAttempts; attempt += 1) {
    try {
      if (await probe(port)) {
        reachable = true;
        break;
      }
    } catch {
      // health gate retries below
    }
    if (attempt < healthAttempts) {
      await new Promise((resolve) => setTimeout(resolve, healthIntervalMs));
    }
  }
  if (!reachable) {
    throw new Error(`[tunnel] app not responding on ${localUrl}; tunnel not started`);
  }

  let binary;
  try {
    binary = await ensure({ version, binOverride: opts.binOverride });
  } catch (err) {
    throw new Error(redact(`[tunnel] binary unavailable: ${err.message}`));
  }

  const args = buildArgs({ port, token, extra: opts.extraArgs });
  let child;
  try {
    child = spawn(binary, args);
  } catch (err) {
    throw new Error(redact(`[tunnel] cloudflared spawn failed: ${err.message}`));
  }

  let settled = false;
  let killTimer;

  const dispose = () => {
    try {
      child.kill('SIGTERM');
    } catch {
      // the child is already gone
    }
    if (platform === 'win32' && child.pid) {
      const pid = child.pid;
      const run = opts.execTaskkill
        ?? ((argsToRun) => new Promise((resolve) => execFile('taskkill', argsToRun, () => resolve())));
      killTimer = setTimeout(() => {
        run(['/PID', String(pid), '/T', '/F']).catch(() => {});
      }, 2000);
      if (killTimer.unref) killTimer.unref();
    }
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      dispose();
      reject(new Error(`[tunnel] readiness timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    if (timer.unref) timer.unref();

    let announcedHost = false;

    const ready = (publicUrl) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (publicUrl) {
        onLog(`[tunnel] public URL: ${publicUrl}`);
      } else if (opts.hostname) {
        const host = opts.hostname.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        onLog(`[tunnel] public URL: https://${host}`);
      }
      resolve({ child, publicUrl, dispose });
    };

    const onLine = (line) => {
      const url = token ? null : extractUrl(line);
      if (url) {
        ready(url);
        return;
      }
      if (token) {
        const ingress = extractIngressHost(line);
        if (ingress && !announcedHost) {
          announcedHost = true;
          onLog(`[tunnel] public URL: https://${ingress.hostname}`);
          if (ingress.service && !isSameLocalService(ingress.service, localUrl)) {
            onWarn(`[tunnel] ingress points at ${ingress.service}, expected ${localUrl}`);
          }
        }
        if (isRegisteredLine(line)) {
          ready(null);
          return;
        }
      }
      if (classifyLine(line) === 'error') {
        let text = stripAnsi(line).trim();
        if (token) text = text.split(token).join('<redacted>');
        onWarn(`[tunnel] ${text}`);
      }
    };

    if (child.stdout) subscribeLines(child.stdout, onLine);
    if (child.stderr) subscribeLines(child.stderr, onLine);
    child.on('error', (err) => {
      const message = redact(`[tunnel] cloudflared spawn failed: ${err.message}`);
      if (settled) {
        onWarn(message);
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    });
    child.on('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`[tunnel] cloudflared exited before readiness (code=${code})`));
        return;
      }
      if (code !== 0 && code !== null) {
        onWarn(`[tunnel] cloudflared exited (code=${code} signal=${signal ?? ''})`);
      }
    });
  });
}

module.exports = {
  PINNED_VERSION,
  buildArgs,
  classifyLine,
  extractIngressHost,
  extractUrl,
  isSameLocalService,
  isTunnelEnabled,
  maskArgs,
  parseExtraArgs,
  resolveVersion,
  startTunnel,
};
