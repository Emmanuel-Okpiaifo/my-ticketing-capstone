import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { createHttpServer } from '../src/http/app.js';
import { createSQLiteRepository } from '../src/repositories/sqlite.js';

function request(server, { method = 'GET', path: requestPath = '/', body, headers = {} } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { method, port, host: '127.0.0.1', path: requestPath, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('SQLite constraints and Build 4 API data persist after a server restart', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ticketing-build5-'));
  const databasePath = path.join(directory, 'ticketing.db');
  let database;
  let server;
  t.after(async () => {
    if (server?.listening) {
      await closeServer(server);
    }
    if (database) {
      closeDatabase(database);
    }
    rmSync(directory, { recursive: true, force: true });
  });

  database = openDatabase(databasePath);
  let repository = createSQLiteRepository(database);
  server = createHttpServer({ repository });
  await listen(server);

  const eventResponse = await request(server, {
    method: 'POST',
    path: '/api/events',
    headers: { 'x-user-id': 'sqlite-organizer', 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Persistent event',
      city: 'Lagos',
      venue: 'Test Hall',
      startsAt: '2026-12-05T17:00:00Z',
    }),
  });
  assert.equal(eventResponse.statusCode, 201);
  const event = JSON.parse(eventResponse.body);

  const tierResponse = await request(server, {
    method: 'POST',
    path: `/api/events/${event.id}/tiers`,
    headers: { 'x-user-id': 'sqlite-organizer', 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'General', priceCents: 5000, capacity: 3 }),
  });
  assert.equal(tierResponse.statusCode, 201);
  const tier = JSON.parse(tierResponse.body);

  const publishResponse = await request(server, {
    method: 'POST',
    path: `/api/events/${event.id}/publish`,
    headers: { 'x-user-id': 'sqlite-organizer' },
  });
  assert.equal(publishResponse.statusCode, 200);

  const invalidTier = database.prepare(`
    INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  assert.throws(() => invalidTier.run('bad-tier', event.id, 'Invalid', 100, 1, 2));
  assert.throws(() => invalidTier.run('missing-event-tier', 'missing-event', 'Invalid', 100, 1, 0));

  await closeServer(server);
  server = null;
  closeDatabase(database);
  database = null;

  database = openDatabase(databasePath);
  repository = createSQLiteRepository(database);
  server = createHttpServer({ repository });
  await listen(server);

  const eventsResponse = await request(server, { path: '/api/events' });
  assert.equal(eventsResponse.statusCode, 200);
  const events = JSON.parse(eventsResponse.body).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].id, event.id);
  assert.equal(events[0].tiers[0].id, tier.id);
});
