import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DEFAULT_MAX_BODY_BYTES, DEFAULT_REDACT_KEYS } from './capture.js';
import { NEST_RN_LENS_OPTIONS } from './constants.js';
import { NestRnLensInterceptor } from './interceptor.js';
import { NestRnLensReporter } from './reporter.js';
import type { NestRnLensOptions } from './types.js';

@Module({})
export class NestRnLensModule {
  /**
   * Registers the interceptor for every controller in the app.
   *
   * ```ts
   * @Module({ imports: [NestRnLensModule.forRoot({ app: 'api' })] })
   * export class AppModule {}
   * ```
   */
  static forRoot(options: NestRnLensOptions): DynamicModule {
    const resolved: NestRnLensOptions = {
      ...options,
      enabled: options.enabled ?? process.env.NODE_ENV !== 'production',
      log: options.log ?? true,
      captureBodies: options.captureBodies ?? true,
      maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      redactKeys: [...DEFAULT_REDACT_KEYS, ...(options.redactKeys ?? [])],
    };
    return {
      module: NestRnLensModule,
      providers: [
        { provide: NEST_RN_LENS_OPTIONS, useValue: resolved },
        NestRnLensReporter,
        { provide: APP_INTERCEPTOR, useClass: NestRnLensInterceptor },
      ],
    };
  }
}
