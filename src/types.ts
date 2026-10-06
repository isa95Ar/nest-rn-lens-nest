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
}
