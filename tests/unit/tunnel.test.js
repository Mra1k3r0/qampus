import { describe, it, expect } from 'vitest';
import tunnel from '../../src/tunnel.js';

const {
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
} = tunnel;

describe('tunnel configuration', () => {
  it('enables the tunnel from TUNNEL or CLOUDFLARED_ENABLED', () => {
    expect(isTunnelEnabled({ TUNNEL: 'yes' })).toBe(true);
    expect(isTunnelEnabled({ CLOUDFLARED_ENABLED: '1' })).toBe(true);
    expect(isTunnelEnabled({ TUNNEL: 'off', CLOUDFLARED_ENABLED: 'true' })).toBe(false);
    expect(isTunnelEnabled({})).toBe(false);
  });

  it('pins a release unless the operator overrides it', () => {
    expect(resolveVersion()).toEqual({ version: PINNED_VERSION, usedLatest: false });
    expect(resolveVersion('v2026.10.4')).toEqual({ version: '2026.10.4', usedLatest: false });
    expect(resolveVersion('latest')).toEqual({ version: 'latest', usedLatest: true });
  });

  it('splits extra cloudflared flags without a shell', () => {
    expect(parseExtraArgs('--protocol http2 --edge-ip-version 4')).toEqual([
      '--protocol',
      'http2',
      '--edge-ip-version',
      '4',
    ]);
    expect(parseExtraArgs('')).toEqual([]);
  });
});

describe('cloudflared arguments', () => {
  it('puts no-autoupdate before the token subcommand and redacts the token', () => {
    const args = buildArgs({ token: 'secret-token', port: 3000 });
    expect(args).toEqual([
      '--no-autoupdate',
      'tunnel',
      'run',
      '--token',
      'secret-token',
    ]);
    expect(maskArgs(args)).toContain('<redacted>');
    expect(maskArgs(args)).not.toContain('secret-token');
  });

  it('builds a quick tunnel pointed at the local app', () => {
    const args = buildArgs({ port: 3200 });
    expect(args).toContain('http://127.0.0.1:3200');
    expect(args).not.toContain('--token');
  });
});

describe('cloudflared log parsing', () => {
  it('extracts a quick tunnel URL from ANSI output', () => {
    const line = '\x1B[32mINF\x1B[0m https://demo-name.trycloudflare.com is ready';
    expect(extractUrl(line)).toBe('https://demo-name.trycloudflare.com');
  });

  it('extracts the dashboard hostname and service from a token tunnel', () => {
    const line = 'INF Updated to new configuration config={"ingress":[{"hostname":"queue.example.com","service":"http://127.0.0.1:3000"}]}';
    expect(extractIngressHost(line)).toEqual({
      hostname: 'queue.example.com',
      service: 'http://127.0.0.1:3000',
    });
  });

  it('treats loopback hostnames as the same service', () => {
    expect(isSameLocalService('http://127.0.0.1:3000', 'http://localhost:3000/')).toBe(true);
    expect(isSameLocalService('http://127.0.0.1:3000', 'http://127.0.0.1:3001')).toBe(false);
  });

  it('ignores known startup noise and surfaces real failures', () => {
    expect(classifyLine('ERR Cannot determine default origin certificate path')).toBe('ignore');
    expect(classifyLine('INF Settings: map[transport-loglevel:fatal]')).toBe('ignore');
    expect(classifyLine('ERR failed to connect to edge')).toBe('error');
  });
});

describe('tunnel startup', () => {
  it('does not spawn cloudflared when the local app is unhealthy', async () => {
    await expect(startTunnel({
      port: 3999,
      token: 'secret',
      healthAttempts: 1,
      healthIntervalMs: 1,
      probe: async () => false,
    })).rejects.toThrow('app not responding');
  });
});
