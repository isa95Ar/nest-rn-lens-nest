# @nest-rn-lens/nest

**See which React Native screen made each request to your NestJS API.**

A NestJS interceptor that records every request your API handles: the app and
the exact file and line that sent it, the endpoint and the handler that answered,
the status, and the time it took.

```
[NestRnLens] mobile (ios) apps/mobile/src/screens/order-details.tsx:23 → GET /orders/:id → OrdersController.findOne 200 4ms
```

It is the server half of **NestRN Lens**, a toolkit for Turborepo monorepos with
a NestJS API and a React Native (Expo) app. On its own it gives you readable
request logs and a typed event for every call. With the NestRN Lens VS Code
extension, those events become a live traffic panel where you can click any
request to open the screen that made it or the handler that answered it.

## Install

```bash
npm install @nest-rn-lens/nest
# or
pnpm add @nest-rn-lens/nest
yarn add @nest-rn-lens/nest
```

## Requirements

Any NestJS API that serves React Native (or web) clients works. There's nothing
specific to one project.

| Requirement      | Supported                                       |
| ---------------- | ----------------------------------------------- |
| NestJS           | 10, 11 or 12                                    |
| RxJS             | 7                                               |
| HTTP platform    | Express (default) or Fastify                    |
| Module system    | ES modules or CommonJS                          |
| Node.js          | 18+, or what your NestJS version requires       |

A Turborepo isn't required for the interceptor itself. It's only needed for the
NestRN Lens VS Code extension, which finds your API and app inside the monorepo.

## Quick start

Import the module once, in your root module:

```ts
import { Module } from '@nestjs/common';
import { NestRnLensModule } from '@nest-rn-lens/nest';

@Module({
  imports: [NestRnLensModule.forRoot({ app: 'api' })],
})
export class AppModule {}
```

That's it. Every request handled by a controller is now logged:

```
[NestRnLens] unknown (android) → GET /orders → OrdersController.findAll 200 3ms
```

Requests show `unknown` until the client says who it is. The next section
explains how.

## Telling the API who's calling

A request on its own doesn't say which app or which screen sent it. The client
adds that with three headers:

| Header                    | Example                                         | Used for                                          |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `x-nest-rn-lens-app`      | `mobile`                                        | Which app made the request                        |
| `x-nest-rn-lens-caller`   | `/repo/apps/mobile/src/screens/orders.tsx:23`   | The file and line that made it                    |
| `x-nest-rn-lens-trace-id` | `5f0c…`                                         | Linking every hop of one request chain            |

You don't have to write these by hand. The upcoming React Native client,
`@nest-rn-lens/react-native`, wraps `fetch` and fills them in development,
working out the calling file from the stack trace.

When a header is missing, the interceptor still reports the request:

- the app is `unknown`
- the platform is guessed from the `User-Agent` (`okhttp` → Android,
  `CFNetwork` → iOS, a browser → web)
- a new trace id is created

The trace id is always sent back in the `x-nest-rn-lens-trace-id` response
header, so the client or the next service can reuse it.

The header names are exported, so you can use them in your own code:

```ts
import { NEST_RN_LENS_HEADERS } from '@nest-rn-lens/nest';

fetch(url, { headers: { [NEST_RN_LENS_HEADERS.app]: 'admin-dashboard' } });
```

## Options

```ts
NestRnLensModule.forRoot({
  app: 'api',
  enabled: true,
  log: true,
  onEvent: (event) => {},
});
```

| Option    | Type                              | Default                              | Description                                                                                   |
| --------- | --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `app`     | `string`                          | required                             | Name of this API in logs and in the traffic graph.                                            |
| `enabled` | `boolean`                         | `true` unless `NODE_ENV=production`  | Turns the interceptor on or off. When off, requests pass through untouched.                   |
| `log`     | `boolean`                         | `true`                               | Logs a readable line per request, plus the full event as JSON at debug level.                 |
| `onEvent` | `(event: NestRnLensEvent) => void` | none                                 | Called with every event. Forward traffic to your own tooling, tests or metrics.               |

### The event

```ts
interface NestRnLensEvent {
  id: string;
  traceId: string;
  timestamp: number; // ms since epoch, when the response was ready
  durationMs: number;
  source: {
    app: string; // "mobile", or "unknown"
    caller?: string; // "/repo/apps/mobile/src/screens/orders.tsx:23"
    platform: 'ios' | 'android' | 'web' | 'unknown';
  };
  target: {
    app: string; // your `app` option
    method: string; // "GET"
    path: string; // "/orders/42" (no query string)
    route: string; // "/orders/:id"
    controller: string; // "OrdersController"
    handler: string; // "findOne"
  };
  status: number; // 200, 201, 404, 500…
  error?: string; // exception message, when the handler threw
}
```

`route` is the route pattern, not the URL, so all calls to one endpoint group
together. `status` follows Nest's rules: `@HttpCode()` when set, `201` for
`POST`, the exception's status when a handler throws, and `500` for other errors.

## Safe by design

NestRN Lens is a development tool. It is built so that it can't hurt the API it
watches:

- **Off in production by default.** Unless you pass `enabled: true`, nothing
  runs when `NODE_ENV=production`.
- **Never breaks a request.** If your `onEvent` callback or the logger throws,
  the error is swallowed and the response goes out as usual.
- **Doesn't change responses.** The only thing it adds is the trace id header.
- **HTTP only.** Microservice, WebSocket and GraphQL contexts pass straight
  through.

## Browsers and CORS

Requests from a web build carry custom headers, so the browser sends a
preflight request first. Enable CORS in development:

```ts
const app = await NestFactory.create(AppModule);
app.enableCors({ exposedHeaders: ['x-nest-rn-lens-trace-id'] });
```

`exposedHeaders` is only needed if browser code reads the trace id from the
response. Native React Native apps don't use CORS at all.

## Limitations

- Only requests that reach a controller are reported. A request to a route that
  doesn't exist gets a 404 from Nest before any interceptor runs.
- `durationMs` is measured inside Nest, from the interceptor until the handler
  returns. It doesn't include network time or response serialization.

## NestRN Lens packages

| Package                       | What it does                                                      | Status        |
| ----------------------------- | ----------------------------------------------------------------- | ------------- |
| `@nest-rn-lens/nest`          | This interceptor                                                  | Available     |
| `@nest-rn-lens/react-native`  | `fetch` wrapper that sends the app name and the calling screen    | Coming soon   |
| NestRN Lens for VS Code       | Live traffic panel with the app running in a phone frame          | Coming soon   |

## Development

```bash
npm install
npm test        # builds the tests and runs them on Express and Fastify
npm run build   # ES module and CommonJS builds in dist/
```

## License

MIT
