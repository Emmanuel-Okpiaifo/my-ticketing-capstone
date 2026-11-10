import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { DomainError } from '../src/domain/errors.js';
import {
  assertTransition,
  BOOKING_STATES,
  BOOKING_TRANSITIONS,
  canTransition,
} from '../src/domain/bookingStateMachine.js';
import { createHttpServer } from '../src/http/app.js';
import { Router } from '../src/http/router.js';

const ALLOWED_MOVES = [
  ['pending', 'paid'],
  ['pending', 'cancelled'],
  ['paid', 'checked_in'],
  ['paid', 'refunded'],
  ['paid', 'cancelled'],
];

test('booking state machine permits every allowed transition', () => {
  for (const [from, to] of ALLOWED_MOVES) {
    assert.equal(canTransition(from, to), true);
    assert.doesNotThrow(() => assertTransition(from, to));
  }
});

test('booking state machine rejects every other transition', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (BOOKING_TRANSITIONS[from].includes(to)) {
        continue;
      }

      assert.equal(canTransition(from, to), false, `${from} must not transition to ${to}`);
      assert.throws(
        () => assertTransition(from, to),
        (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
      );
    }
  }
  assert.equal(canTransition('unknown', 'paid'), false);
  assert.throws(
    () => assertTransition('unknown', 'paid'),
    (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
  );
});

test('router matches methods, static paths, and named parameters', () => {
  const router = new Router();
  const handler = () => 'matched';
  router.add('get', '/api/events/:eventId', handler);

  assert.deepEqual(router.match('GET', '/api/events/event-123'), {
    handler,
    params: { eventId: 'event-123' },
  });
  assert.equal(router.match('POST', '/api/events/event-123'), null);
  assert.equal(router.match('GET', '/api/events'), null);
});

function request(server, { method = 'GET', path = '/', body, headers = {} } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { method, port, host: '127.0.0.1', path, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

test('HTTP server responds to a real GET /health request', async (t) => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const response = await request(server, { path: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
});

test('HTTP errors use a consistent JSON shape for API 404s and invalid JSON', async (t) => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const missing = await request(server, { path: '/api/unknown' });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.body), {
    error: { code: 'NOT_FOUND', message: 'API route not found.' },
  });

  const invalidJson = await request(server, {
    method: 'POST',
    path: '/api/unknown',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidJson.statusCode, 400);
  const parsedError = JSON.parse(invalidJson.body);
  assert.equal(parsedError.error.code, 'INVALID_JSON');
  assert.equal(typeof parsedError.error.message, 'string');
  assert.equal(Object.hasOwn(parsedError.error, 'stack'), false);
});

test('static serving returns public files and blocks paths outside public/', async (t) => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const home = await request(server);
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /Event Ticketing/);

  const escaped = await request(server, { path: '/%2e%2e%2fpackage.json' });
  assert.equal(escaped.statusCode, 404);
  assert.deepEqual(JSON.parse(escaped.body), {
    error: { code: 'NOT_FOUND', message: 'Resource not found.' },
  });
});
