import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { LOGGER_CONTEXT, NEST_RN_LENS_OPTIONS } from './constants.js';
import type { NestRnLensEvent, NestRnLensOptions } from './types.js';

/** Sends each event to the logger and to the `onEvent` callback. Never throws. */
@Injectable()
export class NestRnLensReporter {
  private readonly logger = new Logger(LOGGER_CONTEXT);
  private repoRoot?: string;

  constructor(@Inject(NEST_RN_LENS_OPTIONS) private readonly options: NestRnLensOptions) {}

  report(event: NestRnLensEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // A broken callback must not break the request it observes.
    }
    if (this.options.log === false) {
      return;
    }
    try {
      this.logger.log(this.describe(event));
      this.logger.debug(JSON.stringify(event));
    } catch {
      // Same for a broken logger.
    }
  }

  /** "mobile (ios) apps/mobile/src/screens/orders.tsx:17 → GET /orders → OrdersController.findAll 200 4ms" */
  private describe({ source, target, status, durationMs }: NestRnLensEvent): string {
    const from = [`${source.app} (${source.platform})`, this.shortPath(source.caller)].filter(Boolean).join(' ');
    return `${from} → ${target.method} ${target.route} → ${target.controller}.${target.handler} ${status} ${durationMs}ms`;
  }

  private shortPath(caller?: string): string | undefined {
    if (!caller || !SOURCE_LOCATION.test(caller)) {
      return caller;
    }
    this.repoRoot ??= findRepoRoot(process.cwd());
    return formatCaller(caller, this.repoRoot);
  }
}

// "/repo/apps/mobile/src/screens/Orders.tsx:23": an absolute file path plus a line.
const SOURCE_LOCATION = /^\/.+:\d+$/;

/**
 * Callers that are source locations are shown relative to the monorepo root
 * (clients send absolute paths so editors can open them). Anything else, such as
 * a web page path like "/orders/42", is shown as sent.
 */
export function formatCaller(caller: string, repoRoot: string): string {
  return SOURCE_LOCATION.test(caller) ? relative(repoRoot, caller) : caller;
}

const ROOT_MARKERS = ['turbo.json', 'pnpm-workspace.yaml', '.git'];

function findRepoRoot(from: string): string {
  let dir = from;
  while (!ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return from;
    }
    dir = parent;
  }
  return dir;
}
