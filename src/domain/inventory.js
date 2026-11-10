import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';

const MAX_TICKETS_PER_BOOKING = 10;

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`, 'VALIDATION');
  }
}

function assertStore(store) {
  assertObject(store, 'Store');
  if (!(store.events instanceof Map) || !(store.bookingsByReference instanceof Map)) {
    throw new DomainError('Store must be created with createStore().', 'VALIDATION');
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError(`${label} must be a non-empty string.`, 'VALIDATION');
  }
  return value.trim();
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError(`${label} must be a positive safe integer.`, 'VALIDATION');
  }
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(`${label} must be a non-negative safe integer.`, 'VALIDATION');
  }
}

function getEvent(store, eventId) {
  const id = requiredText(eventId, 'Event id');
  const event = store.events.get(id);
  if (!event) {
    throw new DomainError(`Event "${id}" was not found.`, 'NOT_FOUND');
  }
  return event;
}

function getTier(event, tierId) {
  const id = requiredText(tierId, 'Tier id');
  const tier = event.tiers.get(id);
  if (!tier) {
    throw new DomainError(`Ticket tier "${id}" was not found.`, 'NOT_FOUND');
  }
  return tier;
}

function validateQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError(
      `Ticket quantity must be an integer from 1 to ${MAX_TICKETS_PER_BOOKING}.`,
      'VALIDATION',
    );
  }
}

export function createStore() {
  return {
    events: new Map(),
    bookingsByReference: new Map(),
  };
}

export function createEvent(store, eventInput) {
  assertStore(store);
  assertObject(eventInput, 'Event');
  const name = requiredText(eventInput.name, 'Event name');
  const event = {
    id: newId(),
    name,
    tiers: new Map(),
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, tierInput) {
  assertStore(store);
  assertObject(tierInput, 'Ticket tier');
  const event = getEvent(store, eventId);
  const name = requiredText(tierInput.name, 'Ticket tier name');
  nonNegativeSafeInteger(tierInput.priceCents, 'Ticket price in cents');
  positiveSafeInteger(tierInput.capacity, 'Ticket capacity');

  const tier = {
    id: newId(),
    name,
    priceCents: tierInput.priceCents,
    capacity: tierInput.capacity,
    remaining: tierInput.capacity,
    waitlist: new Queue(),
  };
  event.tiers.set(tier.id, tier);
  return tier;
}

export function bookTickets(store, bookingInput) {
  assertStore(store);
  assertObject(bookingInput, 'Booking');
  const event = getEvent(store, bookingInput.eventId);
  const tier = getTier(event, bookingInput.tierId);
  const attendeeName = requiredText(bookingInput.attendeeName, 'Attendee name');
  validateQuantity(bookingInput.quantity);

  if (tier.remaining < bookingInput.quantity) {
    throw new DomainError(
      `Only ${tier.remaining} ticket(s) remain in the "${tier.name}" tier.`,
      'SOLD_OUT',
    );
  }

  const totalCents = tier.priceCents * bookingInput.quantity;
  if (!Number.isSafeInteger(totalCents)) {
    throw new DomainError('Booking total exceeds the safe integer range.', 'VALIDATION');
  }

  let reference = newReference();
  while (store.bookingsByReference.has(reference)) {
    reference = newReference();
  }

  const booking = {
    id: newId(),
    reference,
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity: bookingInput.quantity,
    totalCents,
    status: 'confirmed',
  };

  tier.remaining -= booking.quantity;
  store.bookingsByReference.set(booking.reference, booking);
  return booking;
}

export function cancelBooking(store, reference) {
  assertStore(store);
  const code = requiredText(reference, 'Booking reference');
  const booking = store.bookingsByReference.get(code);
  if (!booking) {
    throw new DomainError(`Booking "${code}" was not found.`, 'NOT_FOUND');
  }
  if (booking.status === 'cancelled') {
    throw new DomainError(`Booking "${code}" has already been cancelled.`, 'INVALID_STATE');
  }

  const event = store.events.get(booking.eventId);
  const tier = event?.tiers.get(booking.tierId);
  if (!tier) {
    throw new DomainError('The booking ticket tier no longer exists.', 'NOT_FOUND');
  }
  if (tier.remaining + booking.quantity > tier.capacity) {
    throw new DomainError('Cancelling would exceed the ticket tier capacity.', 'INVALID_STATE');
  }

  tier.remaining += booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function findBookingByReference(store, reference) {
  assertStore(store);
  const code = requiredText(reference, 'Booking reference');
  return store.bookingsByReference.get(code) ?? null;
}

export function joinWaitlist(store, waitlistInput) {
  assertStore(store);
  assertObject(waitlistInput, 'Waitlist entry');
  const event = getEvent(store, waitlistInput.eventId);
  const tier = getTier(event, waitlistInput.tierId);
  const attendeeName = requiredText(waitlistInput.attendeeName, 'Attendee name');
  validateQuantity(waitlistInput.quantity);

  if (tier.remaining > 0) {
    throw new DomainError('Tickets are still available for this tier.', 'WAITLIST_NOT_NEEDED');
  }

  const entry = {
    id: newId(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity: waitlistInput.quantity,
  };
  tier.waitlist.enqueue(entry);
  return entry;
}
