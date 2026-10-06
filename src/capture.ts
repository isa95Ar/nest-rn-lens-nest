import { HttpException } from '@nestjs/common';
import type { CapturedBody } from './types.js';

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/**
 * Field and header names whose values are never captured, matched ignoring case
 * and separators ("api_key", "apiKey" and "API-Key" are the same).
 */
export const DEFAULT_REDACT_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'creditcard',
  'cardnumber',
  'cvv',
  'ssn',
];

export const REDACTED = '[redacted]';

export interface CaptureOptions {
  maxBodyBytes: number;
  redactKeys: string[];
}

const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isSensitive(key: string, redactKeys: string[]): boolean {
  const name = normalize(key);
  return name.length > 0 && redactKeys.some((pattern) => name.includes(normalize(pattern)));
}

/**
 * Turns a request or response body into something safe to log: sensitive
 * fields redacted, binary data and streams summarized, and anything larger
 * than `maxBodyBytes` cut to a text preview.
 */
export function captureBody(value: unknown, { maxBodyBytes, redactKeys }: CaptureOptions): CapturedBody | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isBinary(value)) {
    return { size: value.byteLength, summary: `[binary ${formatBytes(value.byteLength)}]` };
  }
  if (isStream(value)) {
    return { size: 0, summary: '[stream]' };
  }

  let json: string | undefined;
  try {
    json = JSON.stringify(value, (key, field) => (key && isSensitive(key, redactKeys) ? REDACTED : field));
  } catch {
    return { size: 0, summary: '[could not be serialized]' };
  }
  if (json === undefined) {
    return undefined;
  }

  const size = Buffer.byteLength(json);
  if (size > maxBodyBytes) {
    return { size, truncated: true, preview: json.slice(0, maxBodyBytes) };
  }
  return { size, value: JSON.parse(json) };
}

/** Request headers with sensitive values replaced. */
export function captureHeaders(
  headers: Record<string, string | string[] | undefined>,
  redactKeys: string[],
): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    captured[name] = isSensitive(name, redactKeys) ? REDACTED : Array.isArray(value) ? value.join(', ') : value;
  }
  return captured;
}

/** The body Nest sends for an exception: HttpException's response, or its generic 500. */
export function errorResponseBody(error: unknown): unknown {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    return typeof response === 'string' ? { statusCode: error.getStatus(), message: response } : response;
  }
  return { statusCode: 500, message: 'Internal server error' };
}

/** Leaves out empty query and params objects: there's nothing to show. */
export function nonEmpty(value: unknown): unknown {
  if (value && typeof value === 'object' && Object.keys(value).length === 0) {
    return undefined;
  }
  return value;
}

function isBinary(value: unknown): value is Uint8Array | ArrayBuffer {
  return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

// Readable streams and Nest's StreamableFile.
function isStream(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { pipe?: unknown; getStream?: unknown };
  return typeof candidate.pipe === 'function' || typeof candidate.getStream === 'function';
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
