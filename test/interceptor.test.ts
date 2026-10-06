import 'reflect-metadata';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  type INestApplication,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { NEST_RN_LENS_HEADERS, NestRnLensModule, type NestRnLensEvent, type NestRnLensOptions } from '../src/index.js';

@Controller('pokemon')
class PokemonController {
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    if (id === 999) {
      throw new NotFoundException('No such pokemon');
    }
    return { id };
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return { ok: true, received: body, accessToken: 'abc123' };
  }

  @Get('search/all')
  search(@Query('q') q: string) {
    return { q, results: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Pokémon number ${i}` })) };
  }

  @Get(':id/sprite')
  sprite() {
    return new StreamableFile(Buffer.from('not really a png'));
  }

  @Delete(':id')
  @HttpCode(204)
  remove() {}

  @Get(':id/crash')
  crash() {
    throw new Error('boom');
  }
}

async function startApp(platform: 'express' | 'fastify', options: NestRnLensOptions) {
  @Module({ imports: [NestRnLensModule.forRoot(options)], controllers: [PokemonController] })
  class TestModule {}

  const app: INestApplication =
    platform === 'fastify'
      ? await NestFactory.create(TestModule, new FastifyAdapter(), { logger: false })
      : await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, url: (await app.getUrl()).replace('[::1]', '127.0.0.1') };
}

const IOS_APP_HEADERS = {
  [NEST_RN_LENS_HEADERS.app]: 'pokedex',
  [NEST_RN_LENS_HEADERS.caller]: '/repo/apps/pokedex/src/screens/detail.tsx:23',
  'user-agent': 'Expo/1017 CFNetwork/1.0 Darwin/25.0',
};

for (const platform of ['express', 'fastify'] as const) {
  describe(`NestRnLensModule on ${platform}`, () => {
    const events: NestRnLensEvent[] = [];
    let app: INestApplication;
    let url: string;

    before(async () => {
      ({ app, url } = await startApp(platform, { app: 'api', enabled: true, log: false, onEvent: (e) => events.push(e) }));
    });
    after(() => app.close());

    // Each request produces exactly one event; return it with the response.
    async function call(method: string, path: string, headers: Record<string, string> = {}) {
      const before = events.length;
      const response = await fetch(`${url}${path}`, { method, headers });
      await response.arrayBuffer();
      assert.equal(events.length, before + 1, `expected one event for ${method} ${path}`);
      return { response, event: events[events.length - 1] };
    }

    it('reports the caller, the route pattern and the handler', async () => {
      const { event } = await call('GET', '/pokemon/25?lang=en', IOS_APP_HEADERS);

      assert.deepEqual(event.source, {
        app: 'pokedex',
        caller: '/repo/apps/pokedex/src/screens/detail.tsx:23',
        platform: 'ios',
      });
      assert.deepEqual(event.target, {
        app: 'api',
        method: 'GET',
        path: '/pokemon/25',
        route: '/pokemon/:id',
        controller: 'PokemonController',
        handler: 'findOne',
      });
      assert.equal(event.status, 200);
      assert.equal(event.error, undefined);
      assert.ok(event.durationMs >= 0);
    });

    it('echoes the trace id, or creates one', async () => {
      const sent = await call('GET', '/pokemon/1', { [NEST_RN_LENS_HEADERS.traceId]: 'trace-abc' });
      assert.equal(sent.event.traceId, 'trace-abc');
      assert.equal(sent.response.headers.get(NEST_RN_LENS_HEADERS.traceId), 'trace-abc');

      const created = await call('GET', '/pokemon/1');
      assert.match(created.event.traceId, /^[0-9a-f-]{36}$/);
      assert.equal(created.response.headers.get(NEST_RN_LENS_HEADERS.traceId), created.event.traceId);
    });

    it('falls back to the user agent when the client sends no headers', async () => {
      const { event } = await call('GET', '/pokemon/1', { 'user-agent': 'okhttp/4.12.0' });
      assert.deepEqual(event.source, { app: 'unknown', caller: undefined, platform: 'android' });
    });

    it('reports the status Nest sends: 201 for POST, @HttpCode, errors', async () => {
      assert.equal((await call('POST', '/pokemon')).event.status, 201);
      assert.equal((await call('DELETE', '/pokemon/1')).event.status, 204);

      const notFound = await call('GET', '/pokemon/999');
      assert.equal(notFound.response.status, 404);
      assert.equal(notFound.event.status, 404);
      assert.equal(notFound.event.error, 'No such pokemon');

      const badRequest = await call('GET', '/pokemon/abc');
      assert.equal(badRequest.event.status, 400);

      const crash = await call('GET', '/pokemon/1/crash');
      assert.equal(crash.response.status, 500);
      assert.equal(crash.event.status, 500);
      assert.equal(crash.event.error, 'boom');
    });

    it('captures the request and the response, with secrets redacted', async () => {
      const response = await fetch(`${url}/pokemon?debug=1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer xyz', 'x-request-tag': 'test' },
        body: JSON.stringify({ name: 'Pikachu', password: 'hunter2', profile: { apiKey: 'k-1', level: 5 } }),
      });
      await response.arrayBuffer();
      const event = events[events.length - 1];

      assert.deepEqual(event.request?.query, { debug: '1' });
      assert.deepEqual(event.request?.body?.value, {
        name: 'Pikachu',
        password: '[redacted]',
        profile: { apiKey: '[redacted]', level: 5 },
      });
      assert.equal(event.request?.headers.authorization, '[redacted]');
      assert.equal(event.request?.headers['x-request-tag'], 'test');
      assert.deepEqual(event.response?.body?.value, {
        ok: true,
        received: { name: 'Pikachu', password: '[redacted]', profile: { apiKey: '[redacted]', level: 5 } },
        accessToken: '[redacted]',
      });
    });

    it('captures route params and the error body Nest sends', async () => {
      const { event } = await call('GET', '/pokemon/999');
      assert.deepEqual(event.request?.params, { id: '999' });
      assert.deepEqual(event.response?.body?.value, { message: 'No such pokemon', error: 'Not Found', statusCode: 404 });

      const crash = await call('GET', '/pokemon/1/crash');
      assert.deepEqual(crash.event.response?.body?.value, { statusCode: 500, message: 'Internal server error' });
    });

    it('cuts large bodies to a preview and summarizes files', async () => {
      const { event } = await call('GET', '/pokemon/search/all?q=pika');
      const body = event.response?.body;
      assert.equal(body?.truncated, true);
      assert.equal(body?.value, undefined);
      assert.ok(body!.size > 16 * 1024, `size ${body?.size}`);
      assert.equal(body?.preview?.length, 16 * 1024);
      assert.ok(body?.preview?.startsWith('{"q":"pika","results":['));

      const sprite = await call('GET', '/pokemon/1/sprite');
      assert.equal(sprite.event.response?.body?.summary, '[stream]');
    });
  });
}

describe('NestRnLensModule options', () => {
  it('does nothing when disabled', async () => {
    const events: NestRnLensEvent[] = [];
    const { app, url } = await startApp('express', { app: 'api', enabled: false, onEvent: (e) => events.push(e) });
    try {
      const response = await fetch(`${url}/pokemon/1`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get(NEST_RN_LENS_HEADERS.traceId), null);
      assert.equal(events.length, 0);
    } finally {
      await app.close();
    }
  });

  it('is off by default in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const events: NestRnLensEvent[] = [];
    try {
      const { app, url } = await startApp('express', { app: 'api', onEvent: (e) => events.push(e) });
      await (await fetch(`${url}/pokemon/1`)).arrayBuffer();
      await app.close();
      assert.equal(events.length, 0);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('leaves bodies out when captureBodies is false', async () => {
    const events: NestRnLensEvent[] = [];
    const { app, url } = await startApp('express', { app: 'api', enabled: true, log: false, captureBodies: false, onEvent: (e) => events.push(e) });
    try {
      await (await fetch(`${url}/pokemon/1`)).arrayBuffer();
      assert.equal(events.length, 1);
      assert.equal(events[0].request, undefined);
      assert.equal(events[0].response, undefined);
    } finally {
      await app.close();
    }
  });

  it('redacts extra keys and honors a smaller size limit', async () => {
    const events: NestRnLensEvent[] = [];
    const { app, url } = await startApp('express', {
      app: 'api',
      enabled: true,
      log: false,
      maxBodyBytes: 30,
      redactKeys: ['name'],
      onEvent: (e) => events.push(e),
    });
    try {
      await (
        await fetch(`${url}/pokemon`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Mew"}' })
      ).arrayBuffer();
      assert.deepEqual(events[0].request?.body?.value, { name: '[redacted]' });
      assert.equal(events[0].response?.body?.truncated, true);
      assert.equal(events[0].response?.body?.preview?.length, 30);
    } finally {
      await app.close();
    }
  });

  it('never lets a failing onEvent break the request', async () => {
    const { app, url } = await startApp('express', {
      app: 'api',
      enabled: true,
      log: false,
      onEvent: () => {
        throw new Error('callback failed');
      },
    });
    try {
      const response = await fetch(`${url}/pokemon/1`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id: 1 });
    } finally {
      await app.close();
    }
  });
});
