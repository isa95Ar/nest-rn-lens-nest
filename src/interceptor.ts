import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Observable, tap } from 'rxjs';
import { NEST_RN_LENS_OPTIONS } from './constants.js';
import {
  detectPlatform,
  type HttpRequest,
  type HttpResponse,
  readHeader,
  requestPath,
  routePattern,
  writeHeader,
} from './http.js';
import { NestRnLensReporter } from './reporter.js';
import { NEST_RN_LENS_HEADERS, type NestRnLensEvent, type NestRnLensOptions } from './types.js';

// Metadata key behind @HttpCode() (HTTP_CODE_METADATA in @nestjs/common/constants,
// unchanged since Nest 5). Inlined because that subpath resolves differently
// across Nest versions.
const HTTP_CODE_METADATA = '__httpCode__';

/**
 * Records every HTTP request handled by a controller: who called it (from the
 * x-nest-rn-lens-* headers), which handler answered, the status and the time.
 */
@Injectable()
export class NestRnLensInterceptor implements NestInterceptor {
  constructor(
    @Inject(NEST_RN_LENS_OPTIONS) private readonly options: NestRnLensOptions,
    private readonly reporter: NestRnLensReporter,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.options.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();
    const start = performance.now();

    const traceId = readHeader(req, NEST_RN_LENS_HEADERS.traceId) ?? randomUUID();
    // Lets the client, and the next service in the chain, reuse the trace id.
    writeHeader(res, NEST_RN_LENS_HEADERS.traceId, traceId);

    const finish = (status: number, error?: string) => {
      const event: NestRnLensEvent = {
        id: randomUUID(),
        traceId,
        timestamp: Date.now(),
        durationMs: Math.round(performance.now() - start),
        source: {
          app: readHeader(req, NEST_RN_LENS_HEADERS.app) ?? 'unknown',
          caller: readHeader(req, NEST_RN_LENS_HEADERS.caller),
          platform: detectPlatform(readHeader(req, 'user-agent')),
        },
        target: {
          app: this.options.app,
          method: req.method,
          path: requestPath(req),
          route: routePattern(req),
          controller: context.getClass().name,
          handler: context.getHandler().name,
        },
        status,
        error,
      };
      this.reporter.report(event);
    };

    return next.handle().pipe(
      tap({
        next: () => finish(this.successStatus(context, req, res)),
        error: (err: unknown) =>
          finish(
            err instanceof HttpException ? err.getStatus() : 500,
            err instanceof Error ? err.message : String(err),
          ),
      }),
    );
  }

  /**
   * The status Nest is about to send. Depending on the platform it may not be
   * written to the response yet, so follow Nest's own rules: @HttpCode(),
   * otherwise 201 for POST and 200 for everything else.
   */
  private successStatus(context: ExecutionContext, req: HttpRequest, res: HttpResponse): number {
    const declared = Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as number | undefined;
    if (declared) {
      return declared;
    }
    // A handler using @Res() may have set its own status.
    if (res.statusCode && res.statusCode !== 200) {
      return res.statusCode;
    }
    return req.method === 'POST' ? 201 : 200;
  }
}
