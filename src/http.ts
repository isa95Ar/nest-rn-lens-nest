import type { Platform } from './types.js';

// The parts of an Express or Fastify request/response we read. Typed here so
// the package doesn't depend on either platform.
export interface HttpRequest {
  method: string;
  url: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Express: the matched route. */
  route?: { path?: unknown };
  baseUrl?: string;
  /** Fastify 4+: the matched route. */
  routeOptions?: { url?: string };
  /** Fastify 3. */
  routerPath?: string;
  /** Parsed by Nest's body parser (Express) or by Fastify. */
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export interface HttpResponse {
  statusCode: number;
  /** Express (Node's ServerResponse). */
  setHeader?(name: string, value: string): unknown;
  /** Fastify reply. */
  header?(name: string, value: string): unknown;
}

export function readHeader(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function writeHeader(res: HttpResponse, name: string, value: string) {
  if (typeof res.header === 'function') {
    res.header(name, value);
  } else {
    res.setHeader?.(name, value);
  }
}

export function requestPath(req: HttpRequest): string {
  return (req.originalUrl ?? req.url).split('?')[0];
}

/** "/orders/:id" rather than "/orders/42", so one endpoint is one graph edge. */
export function routePattern(req: HttpRequest): string {
  const expressRoute = req.route?.path;
  if (typeof expressRoute === 'string') {
    return `${req.baseUrl ?? ''}${expressRoute}`;
  }
  return req.routeOptions?.url ?? req.routerPath ?? requestPath(req);
}

/**
 * Best guess when the client doesn't say. React Native's fetch uses okhttp on
 * Android and CFNetwork on iOS; browsers send a Mozilla user agent.
 */
export function detectPlatform(userAgent = ''): Platform {
  if (/okhttp|android/i.test(userAgent)) {
    return 'android';
  }
  if (/CFNetwork|Darwin|iPhone|iPad/i.test(userAgent)) {
    return 'ios';
  }
  if (/Mozilla/i.test(userAgent)) {
    return 'web';
  }
  return 'unknown';
}
