import net from 'node:net';

// Tests may reach only the local machine (for example the Supabase CLI database).
// Anything else fails fast, so no test can silently depend on an external service.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const originalConnect = net.Socket.prototype.connect;

function targetHost(args: unknown[]): string | undefined {
  // net.connect() and tls.connect() pass Node's normalized [options, callback] array as one argument.
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: string; path?: string };
    if (options.path) return undefined;
    return options.host ?? 'localhost';
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) return undefined;
  return typeof second === 'string' ? second : 'localhost';
}

net.Socket.prototype.connect = function connect(this: net.Socket, ...args: unknown[]) {
  const host = targetHost(args);
  if (host !== undefined && !LOCAL_HOSTS.has(host)) {
    throw new Error(`Network access is blocked in tests (attempted host: ${host})`);
  }
  return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
