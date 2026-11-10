import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { createHttpServer } from '../src/http/app.js';

function request(server, { method = 'GET', path = '/', body, headers = {} } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { method, port, host: '127.0.0.1', path, headers },
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

async function startServer(t, options) {
  const server = createHttpServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return server;
}

function parse(response) {
  return JSON.parse(response.body);
}

test('Build 4 API supports event publishing, search, booking, payment retry, and cancellation', async (t) => {
  const charges = [];
  const server = await startServer(t, {
    paymentGateway: {
      async charge(payment) {
        charges.push(payment);
        return payment.decline
          ? { success: false }
          : { success: true, transactionId: 'test-transaction' };
      },
    },
  });
  const organizer = { 'x-user-id': 'organizer-1', 'content-type': 'application/json' };
  const attendee = { 'x-user-id': 'attendee-1', 'content-type': 'application/json' };

  const created = await request(server, {
    method: 'POST',
    path: '/api/events',
    headers: organizer,
    body: JSON.stringify({
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Landmark Centre',
      startsAt: '2026-12-05T17:00:00Z',
    }),
  });
  assert.equal(created.statusCode, 201);
  const event = parse(created);
  assert.equal(event.title, 'Lagos Tech Meetup');
  assert.equal(event.startsAt, '2026-12-05T17:00:00Z');

  const tierResponse = await request(server, {
    method: 'POST',
    path: `/api/events/${event.id}/tiers`,
    headers: organizer,
    body: JSON.stringify({ name: 'General', priceCents: 500000, capacity: 3 }),
  });
  assert.equal(tierResponse.statusCode, 201);
  const tier = parse(tierResponse);
  assert.equal(tier.sold, 0);
  assert.equal(tier.seatsLeft, 3);

  const unpublishedList = parse(await request(server, { path: '/api/events' }));
  assert.deepEqual(unpublishedList, { events: [] });

  const published = await request(server, {
    method: 'POST',
    path: `/api/events/${event.id}/publish`,
    headers: { 'x-user-id': 'organizer-1' },
  });
  assert.equal(published.statusCode, 200);
  assert.equal(parse(published).status, 'published');

  const search = await request(server, { path: '/api/events?city=lagos&sort=price' });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(parse(search).events.map((item) => item.id), [event.id]);

  const bookingResponse = await request(server, {
    method: 'POST',
    path: '/api/bookings',
    headers: attendee,
    body: JSON.stringify({ tierId: tier.id, quantity: 2 }),
  });
  assert.equal(bookingResponse.statusCode, 201);
  const booking = parse(bookingResponse);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.totalCents, 1000000);

  const declined = await request(server, {
    method: 'POST',
    path: `/api/bookings/${booking.reference}/pay`,
    headers: attendee,
    body: JSON.stringify({ paymentToken: 'tok_declined' }),
  });
  assert.equal(declined.statusCode, 402);
  assert.equal(parse(declined).error.code, 'PAYMENT_DECLINED');
  assert.equal(charges.length, 1);
  assert.equal(Object.hasOwn(charges[0], 'cardNumber'), false);

  const forbiddenPayment = await request(server, {
    method: 'POST',
    path: `/api/bookings/${booking.reference}/pay`,
    headers: { 'x-user-id': 'another-attendee', 'content-type': 'application/json' },
    body: JSON.stringify({ paymentToken: 'tok_success' }),
  });
  assert.equal(forbiddenPayment.statusCode, 403);
  assert.equal(parse(forbiddenPayment).error.code, 'FORBIDDEN');
  assert.equal(charges.length, 1);

  const paid = await request(server, {
    method: 'POST',
    path: `/api/bookings/${booking.reference}/pay`,
    headers: attendee,
    body: JSON.stringify({ paymentToken: 'tok_success' }),
  });
  assert.equal(paid.statusCode, 200);
  assert.equal(parse(paid).status, 'paid');
  assert.equal(charges.length, 2);

  const repeatedPayment = await request(server, {
    method: 'POST',
    path: `/api/bookings/${booking.reference}/pay`,
    headers: attendee,
    body: JSON.stringify({ paymentToken: 'tok_success' }),
  });
  assert.equal(repeatedPayment.statusCode, 409);
  assert.equal(parse(repeatedPayment).error.code, 'INVALID_TRANSITION');
  assert.equal(charges.length, 2);

  const paidCancellation = await request(server, {
    method: 'POST',
    path: `/api/bookings/${booking.reference}/cancel`,
    headers: { 'x-user-id': 'attendee-1' },
  });
  assert.equal(paidCancellation.statusCode, 409);
  assert.equal(parse(paidCancellation).error.code, 'INVALID_STATE');

  const cancelBookingResponse = await request(server, {
    method: 'POST',
    path: '/api/bookings',
    headers: attendee,
    body: JSON.stringify({ tierId: tier.id, quantity: 1 }),
  });
  assert.equal(cancelBookingResponse.statusCode, 201);
  const unpaidBooking = parse(cancelBookingResponse);

  const cancelled = await request(server, {
    method: 'POST',
    path: `/api/bookings/${unpaidBooking.reference}/cancel`,
    headers: { 'x-user-id': 'attendee-1' },
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(parse(cancelled).status, 'cancelled');

  const finalEvents = parse(await request(server, { path: '/api/events?city=LAGOS' }));
  assert.equal(finalEvents.events[0].tiers[0].remaining, 1);
});

test('API returns consistent errors for missing identity, invalid JSON, and invalid input', async (t) => {
  const server = await startServer(t);

  const unauthenticated = await request(server, {
    method: 'POST',
    path: '/api/events',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Meetup',
      city: 'Lagos',
      venue: 'Hall',
      startsAt: '2026-12-05',
    }),
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.deepEqual(parse(unauthenticated).error, {
    code: 'UNAUTHENTICATED',
    message: 'The x-user-id header is required.',
  });

  const invalidJson = await request(server, {
    method: 'POST',
    path: '/api/events',
    headers: { 'x-user-id': 'organizer-1', 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidJson.statusCode, 400);
  assert.equal(parse(invalidJson).error.code, 'INVALID_JSON');
  assert.equal(Object.hasOwn(parse(invalidJson).error, 'stack'), false);

  const invalidPrice = await request(server, {
    method: 'GET',
    path: '/api/events?maxPriceCents=10.5',
  });
  assert.equal(invalidPrice.statusCode, 400);
  assert.equal(parse(invalidPrice).error.code, 'VALIDATION');
});

test('API refuses publishing an event without a tier and reports unknown routes as JSON 404', async (t) => {
  const server = await startServer(t);
  const created = await request(server, {
    method: 'POST',
    path: '/api/events',
    headers: { 'x-user-id': 'organizer-1', 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'No tickets',
      city: 'Lagos',
      venue: 'Hall',
      startsAt: '2026-12-05',
    }),
  });
  const event = parse(created);

  const publish = await request(server, {
    method: 'POST',
    path: `/api/events/${event.id}/publish`,
    headers: { 'x-user-id': 'organizer-1' },
  });
  assert.equal(publish.statusCode, 409);
  assert.equal(parse(publish).error.code, 'INVALID_STATE');

  const unknown = await request(server, { path: '/api/unknown' });
  assert.equal(unknown.statusCode, 404);
  assert.equal(parse(unknown).error.code, 'NOT_FOUND');
});
