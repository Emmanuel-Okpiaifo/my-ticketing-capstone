import assert from 'node:assert/strict';
import test from 'node:test';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { DomainError } from '../src/domain/errors.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createSQLiteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';

test('50 simultaneous attempts to book one seat allow exactly one booking', async (t) => {
  const database = openDatabase(':memory:');
  t.after(() => closeDatabase(database));

  const repository = createSQLiteRepository(database);
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, createMockPaymentGateway());

  const event = await eventService.create({
    title: 'Oversell test',
    city: 'Lagos',
    venue: 'Test Hall',
    startsAt: '2026-12-05T17:00:00Z',
  }, 'oversell-organizer');
  const tier = await eventService.addTier(event.id, {
    name: 'Final seat',
    priceCents: 1000,
    capacity: 1,
  }, 'oversell-organizer');
  await eventService.publish(event.id, 'oversell-organizer');

  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, index) =>
      bookingService.create(
        { tierId: tier.id, quantity: 1 },
        `attendee-${index + 1}`,
      ),
    ),
  );
  const succeeded = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(succeeded.length, 1);
  assert.equal(rejected.length, 49);
  assert.ok(rejected.every((result) =>
    result.reason instanceof DomainError && result.reason.code === 'SOLD_OUT'
  ));
  assert.equal((await repository.listBookings()).length, 1);

  const storedEvent = await repository.getEvent(event.id);
  assert.equal(storedEvent.tiers.get(tier.id).sold, 1);
});
