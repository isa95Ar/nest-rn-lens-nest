/**
 * Headers a client sends so the interceptor knows who made the request.
 * The React Native client (@nest-rn-lens/react-native) fills them in dev.
 */
export const NEST_RN_LENS_HEADERS = {
  /** Name of the calling app, e.g. "mobile". */
  app: 'x-nest-rn-lens-app',
  /** Where in the client the call was made, e.g. "/…/src/screens/OrderList.tsx:42". */
  caller: 'x-nest-rn-lens-caller',
  /** Same id across every hop of one request chain. Echoed back on the response. */
  traceId: 'x-nest-rn-lens-trace-id',
} as const;

export type Platform = 'ios' | 'android' | 'web' | 'unknown';

/** A request or response body, made safe to log. */
export interface CapturedBody {
  /** Size of the serialized body, in bytes. */
  size: number;
  /** The body, with sensitive fields redacted. Absent when truncated or summarized. */
  value?: unknown;
  /** Set when the body was larger than `maxBodyBytes`; `preview` holds its start. */
  truncated?: boolean;
  preview?: string;
  /** For bodies that aren't JSON: "[binary 12.0 KB]", "[stream]". */
  summary?: string;
}

/** One request, as seen by the API. */
export interface NestRnLensEvent {
  id: string;
  traceId: string;
  /** When the response was ready (ms since epoch). */
  timestamp: number;
  durationMs: number;
  source: {
    /** From the x-nest-rn-lens-app header, or "unknown". */
    app: string;
    /** From the x-nest-rn-lens-caller header. */
    caller?: string;
    /** Guessed from the User-Agent. */
    platform: Platform;
  };
  target: {
    /** The `app` option of this API. */
    app: string;
    method: string;
    /** Actual URL path without the query string, e.g. "/orders/42". */
    path: string;
    /** Route pattern, e.g. "/orders/:id". Groups requests to the same endpoint. */
    route: string;
    controller: string;
    handler: string;
  };
  status: number;
  /** Message of the exception, when the handler threw. */
  error?: string;
  /** What the client sent. Only present when `captureBodies` is on (the default). */
  request?: {
    /** Request headers; sensitive ones redacted. */
    headers: Record<string, string>;
    query?: unknown;
    /** Route parameters, e.g. { id: "42" } for /orders/:id. */
    params?: unknown;
    body?: CapturedBody;
  };
  /** What the API answered. Only present when `captureBodies` is on (the default). */
  response?: {
    /** The handler's return value, or the error body Nest sends for an exception. */
    body?: CapturedBody;
  };
}

export interface NestRnLensOptions {
  /** Name of this API in the traffic graph, e.g. "api". */
  app: string;
  /**
   * Turns reporting on or off. Defaults to `true` unless NODE_ENV is
   * "production", so nothing runs in production unless you opt in.
   */
  enabled?: boolean;
  /**
   * Called with every event. Use it to forward traffic somewhere else.
   * Errors thrown here are ignored, so they never affect the request.
   */
  onEvent?: (event: NestRnLensEvent) => void;
  /**
   * Log every event through Nest's Logger (a readable line, plus the JSON at
   * debug level that the NestRN Lens VS Code extension reads). Defaults to `true`.
   */
  log?: boolean;
  /**
   * Include request and response bodies, query, route params and request
   * headers in each event. Defaults to `true`. Sensitive fields are redacted
   * (see `redactKeys`).
   */
  captureBodies?: boolean;
  /** Bodies larger than this are cut to a preview. Defaults to 16 KB. */
  maxBodyBytes?: number;
  /**
   * Extra field or header names to redact, added to the defaults (password,
   * secret, token, authorization, cookie, apiKey, privateKey, creditCard,
   * cardNumber, cvv, ssn). Matched ignoring case and separators, anywhere in
   * the name: "token" also covers "accessToken".
   */
  redactKeys?: string[];
}
