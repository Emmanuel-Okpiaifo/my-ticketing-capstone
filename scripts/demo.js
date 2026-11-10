import { DomainError } from '../src/domain/errors.js';
import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  findBookingByReference,
  joinWaitlist,
} from '../src/domain/inventory.js';

const store = createStore();
const event = createEvent(store, {
  title: 'Summer Sounds',
  city: 'Lagos',
  venue: 'Freedom Park',
  date: '2026-12-05',
});
const tier = addTier(store, event.id, {
  name: 'General admission',
  priceCents: 5000,
  capacity: 3,
});

const ada = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Ada',
  quantity: 2,
});
console.log(`Ada booked ${ada.quantity} of ${tier.capacity} seats.`);

try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Bayo',
    quantity: 2,
  });
} catch (error) {
  if (!(error instanceof DomainError)) {
    throw error;
  }
  console.log(`Bayo's booking was refused (${error.code}): ${error.message}`);
}

const chika = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Chika',
  quantity: 1,
});
console.log(`${chika.attendeeName} booked the last seat. The event is sold out.`);

joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Dara',
  quantity: 1,
});
joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Emeka',
  quantity: 1,
});
console.log(`Waitlist: ${tier.waitlist.size} people are waiting.`);

const found = findBookingByReference(store, ada.reference);
console.log(`Found ${found.attendeeName}'s booking by reference ${found.reference}.`);

cancelBooking(store, ada.reference);
console.log(`${ada.attendeeName} cancelled, freeing ${ada.quantity} seats.`);
console.log(`Next in line: ${tier.waitlist.peek().attendeeName}.`);
