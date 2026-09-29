import { lookup } from 'node:dns/promises';
import net from 'node:net';

// Requests to addresses people configure (connected apps, PunchOut catalogs,
// accounting, a local model server) go through here, so a setting can't be
// used to reach the server's own infrastructure. Link-local addresses (cloud
// metadata services live there) are always refused. Private and loopback
// addresses are allowed, since self-hosting points at Ollama or the other
// Humlens apps on them, unless BLOCK_PRIVATE_OUTBOUND=1 (for hosting many
// teams on one deployment).

export class BlockedUrlError extends Error {}

const MAX_REDIRECTS = 3;

function ipv4Blocked(ip: string, blockPrivate: boolean) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || (a === 169 && b === 254) || (a === 100 && b === 100)) return true; // unspecified, link-local, Alibaba metadata
  if (a >= 224) return true; // multicast and reserved
  if (!blockPrivate) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function ipv6Blocked(ip: string, blockPrivate: boolean) {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d), which URL parsing turns into hex (::ffff:a9fe:a9fe).
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1], blockPrivate);
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [high, low] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return ipv4Blocked(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, blockPrivate);
  }
  if (lower === '::' || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // unspecified, link-local
  if (lower.startsWith('fd00:ec2:')) return true; // AWS metadata over IPv6
  if (!blockPrivate) return false;
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd');
}

/** Throws BlockedUrlError unless `raw` is an http(s) URL whose host resolves only to allowed addresses. */
export async function assertOutboundUrl(raw: string | URL) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError(`Only http and https addresses are allowed (${url.protocol}).`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^metadata(\.google)?\.internal$/i.test(host)) throw new BlockedUrlError(`${host} is not allowed.`);
  const blockPrivate = process.env.BLOCK_PRIVATE_OUTBOUND === '1';
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  for (const { address, family } of addresses) {
    if (family === 4 ? ipv4Blocked(address, blockPrivate) : ipv6Blocked(address, blockPrivate)) {
      throw new BlockedUrlError(`${host} points at ${address}, which this server won't connect to.`);
    }
  }
  return url;
}

/** fetch() for configured addresses: checks the address, and each redirect, before connecting. */
export async function outboundFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = await assertOutboundUrl(input);
  let request = init;
  for (let hop = 0; ; hop += 1) {
    const res = await fetch(url, { ...request, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    if (hop >= MAX_REDIRECTS) throw new BlockedUrlError('Too many redirects.');
    url = await assertOutboundUrl(new URL(location, url));
    // As browsers do: a 303 (or a redirected POST answered 301/302) becomes a GET without a body.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && request.method && request.method !== 'GET')) {
      request = { ...request, method: 'GET', body: undefined };
    }
  }
}
