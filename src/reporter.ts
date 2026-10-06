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

  // Clients send absolute paths (editors need them to open the file); logs are
  // easier to read relative to the monorepo root.
  private shortPath(file?: string): string | undefined {
    if (!file?.startsWith('/')) {
      return file;
    }
    this.repoRoot ??= findRepoRoot(process.cwd());
    return relative(this.repoRoot, file);
  }
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
