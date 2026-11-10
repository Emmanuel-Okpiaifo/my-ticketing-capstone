import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { createSQLiteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

const ATTEMPTS = 50;
const database = openDatabase(':memory:');
const repository = createSQLiteRepository(database);
const eventService = createEventService(repository);
const bookingService = createBookingService(repository, createMockPaymentGateway());

try {
  const event = await eventService.create({
    title: 'Last seat demonstration',
    city: 'Lagos',
    venue: 'Test Hall',
    startsAt: '2026-12-05T17:00:00Z',
  }, 'oversell-organizer');
  const tier = await eventService.addTier(event.id, {
    name: 'Last seat',
    priceCents: 1000,
    capacity: 1,
  }, 'oversell-organizer');
  await eventService.publish(event.id, 'oversell-organizer');

  const attempts = await Promise.all(
    Array.from({ length: ATTEMPTS }, (_, index) =>
      bookingService.create({ tierId: tier.id, quantity: 1 }, `attendee-${index + 1}`)
        .then((booking) => ({ success: true, booking }))
        .catch((error) => ({ success: false, error })),
    ),
  );
  const successfulBookings = attempts.filter((result) => result.success);
  const soldOutBookings = attempts.filter(
    (result) => !result.success && result.error.code === 'SOLD_OUT',
  );
  const storedEvent = await repository.getEvent(event.id);
  const storedTier = storedEvent.tiers.get(tier.id);
  const ticketsBooked = successfulBookings.reduce(
    (total, result) => total + result.booking.quantity,
    0,
  );

  console.log(`Booking requests: ${ATTEMPTS}`);
  console.log(`Bookings succeeded: ${successfulBookings.length}`);
  console.log(`Bookings rejected as SOLD_OUT: ${soldOutBookings.length}`);
  console.log(`Tickets in successful bookings: ${ticketsBooked}`);
  console.log(`Seats recorded as sold: ${storedTier.sold}`);
} finally {
  closeDatabase(database);
}
