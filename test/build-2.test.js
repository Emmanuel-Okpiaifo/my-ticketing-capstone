import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../src/domain/errors.js';
import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  joinWaitlist,
  listEventSummaries,
  publishEvent,
  unpublishEvent,
} from '../src/domain/inventory.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { mergeSort } from '../src/domain/sorting.js';

function makeStore() {
  return createStore();
}

function addEvent(store, {
  title,
  city = 'Lagos',
  venue = 'Main Hall',
  date = '2026-12-05',
  tiers = [],
  published = false,
}) {
  const event = createEvent(store, { title, city, venue, date });
  for (const tier of tiers) {
    addTier(store, event.id, tier);
  }
  if (published) {
    publishEvent(store, event.id);
  }
  return event;
}

function makeSummaries() {
  return [
    {
      id: 'lagos-tech',
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Civic Centre',
      date: '2026-12-06T10:00:00Z',
      tiers: [{ priceCents: 5000, capacity: 20, sold: 8 }],
    },
    {
      id: 'abuja-jazz',
      title: 'Abuja Jazz Night',
      city: 'Abuja',
      venue: 'Jazz House',
      date: '2026-12-05T17:00:00Z',
      tiers: [{ priceCents: 3000, capacity: 10, sold: 4 }],
    },
    {
      id: 'lagos-film',
      title: 'Lagos Film Night',
      city: 'Lagos',
      venue: 'Open Air',
      date: '2026-12-05T19:00:00Z',
      tiers: [{ priceCents: 7000, capacity: 12, sold: 2 }],
    },
    {
      id: 'free-gallery',
      title: 'Free Gallery',
      city: 'Lagos',
      venue: 'Gallery',
      date: '2026-12-08',
      tiers: [],
    },
  ];
}

function expectDomainCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

test('S02: creates a draft event with a new id and hides it from public summaries', () => {
  const store = makeStore();
  const event = addEvent(store, { title: 'Lagos Tech Meetup' });

  assert.ok(event.id);
  assert.equal(event.published, false);
  assert.equal(event.title, 'Lagos Tech Meetup');
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('S02: missing title or city and invalid dates reject without saving an event', () => {
  const store = makeStore();
  for (const input of [
    { city: 'Lagos', venue: 'Hall', date: '2026-12-05' },
    { title: 'Meetup', venue: 'Hall', date: '2026-12-05' },
    { title: 'Meetup', city: 'Lagos', venue: 'Hall', date: '2026-02-30' },
  ]) {
    expectDomainCode(() => createEvent(store, input), 'VALIDATION');
  }
  assert.equal(store.events.size, 0);
});

test('S03: a tier has zero sold and the full capacity remaining', () => {
  const store = makeStore();
  const event = addEvent(store, { title: 'Meetup' });
  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500000,
    capacity: 100,
  });

  assert.equal(tier.sold, 0);
  assert.equal(tier.remaining, 100);
});

test('S03: a fractional price or capacity below one is rejected', () => {
  const store = makeStore();
  const event = addEvent(store, { title: 'Meetup' });
  expectDomainCode(
    () => addTier(store, event.id, { name: 'General', priceCents: 10.5, capacity: 10 }),
    'VALIDATION',
  );
  expectDomainCode(
    () => addTier(store, event.id, { name: 'General', priceCents: 10, capacity: 0 }),
    'VALIDATION',
  );
  assert.equal(event.tiers.size, 0);
});

test('S03: adding a tier to an unknown event returns NOT_FOUND', () => {
  expectDomainCode(
    () => addTier(makeStore(), 'missing-event', { name: 'General', priceCents: 10, capacity: 1 }),
    'NOT_FOUND',
  );
});

test('S04: publishing lists an event and unpublishing removes it', () => {
  const store = makeStore();
  const event = addEvent(store, {
    title: 'Lagos Meetup',
    tiers: [{ name: 'General', priceCents: 2500, capacity: 25 }],
  });

  publishEvent(store, event.id);
  assert.equal(listEventSummaries(store).length, 1);
  assert.equal(listEventSummaries(store)[0].id, event.id);

  unpublishEvent(store, event.id);
  assert.deepEqual(listEventSummaries(store), []);
});

test('S04: publishing without tiers returns INVALID_STATE and leaves the event a draft', () => {
  const store = makeStore();
  const event = addEvent(store, { title: 'Empty event' });

  expectDomainCode(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.published, false);
});

test('S04: public summaries exclude drafts', () => {
  const store = makeStore();
  addEvent(store, {
    title: 'Draft event',
    tiers: [{ name: 'General', priceCents: 1500, capacity: 5 }],
  });

  assert.deepEqual(listEventSummaries(store), []);
});

test('S05: query matches title or venue without case sensitivity', () => {
  const summaries = makeSummaries();
  assert.deepEqual(
    filterEvents(summaries, { q: 'JAZZ' }).map((event) => event.id),
    ['abuja-jazz'],
  );
  assert.deepEqual(
    filterEvents(summaries, { q: 'CIVIC' }).map((event) => event.id),
    ['lagos-tech'],
  );
});

test('S05: city filter ignores capitalization but matches the whole city', () => {
  const summaries = makeSummaries();
  assert.deepEqual(
    filterEvents(summaries, { city: 'lagos' }).map((event) => event.id),
    ['lagos-tech', 'lagos-film', 'free-gallery'],
  );
});

test('S05: maximum price uses the cheapest tier and price sorting puts no-price events last', () => {
  const summaries = makeSummaries();
  const result = searchEvents(summaries, { maxPriceCents: 5000 }, 'price');

  assert.deepEqual(result.map((event) => event.id), [
    'abuja-jazz',
    'lagos-tech',
  ]);
  assert.ok(!result.some((event) => event.id === 'free-gallery'));
});

test('S05: price sort includes events without prices last and filters on the cheapest of multiple tiers', () => {
  const summaries = [
    { id: 'expensive', title: 'Expensive', tiers: [{ priceCents: 5000 }, { priceCents: 2000 }] },
    { id: 'cheap', title: 'Cheap', tiers: [{ priceCents: 1000 }] },
    { id: 'none', title: 'No price', tiers: [] },
  ];

  assert.deepEqual(filterEvents(summaries, { maxPriceCents: 2000 }).map((event) => event.id), [
    'expensive',
    'cheap',
  ]);
  assert.deepEqual(sortEvents(summaries, 'price').map((event) => event.id), [
    'cheap',
    'expensive',
    'none',
  ]);
});

test('S05: date sorting is earliest first and breaks same-day ties by title then id', () => {
  const summaries = [
    { id: 'z', title: 'Same day', date: '2026-12-05', tiers: [] },
    { id: 'b', title: 'Alpha', date: '2026-12-05', tiers: [] },
    { id: 'a', title: 'Alpha', date: '2026-12-05', tiers: [] },
    { id: 'early', title: 'Zeta', date: '2026-12-04', tiers: [] },
  ];

  assert.deepEqual(sortEvents(summaries, 'date').map((event) => event.id), [
    'early',
    'a',
    'b',
    'z',
  ]);
});

test('S05: date-only upper bound includes an event later that day', () => {
  const summaries = makeSummaries();
  assert.deepEqual(
    filterEvents(summaries, { to: '2026-12-05' }).map((event) => event.id),
    ['abuja-jazz', 'lagos-film'],
  );
});

test('S05: date range boundaries are inclusive and onlyAvailable omits sold-out events', () => {
  const summaries = [
    { id: 'available', title: 'Available', city: 'Lagos', venue: 'Hall', date: '2026-12-05', availableSeats: 1 },
    { id: 'sold-out', title: 'Sold out', city: 'Lagos', venue: 'Hall', date: '2026-12-05T23:59:59Z', availableSeats: 0 },
    { id: 'later', title: 'Later', city: 'Lagos', venue: 'Hall', date: '2026-12-06', availableSeats: 2 },
  ];

  assert.deepEqual(
    filterEvents(summaries, { from: '2026-12-05', to: '2026-12-05' }).map((event) => event.id),
    ['available', 'sold-out'],
  );
  assert.deepEqual(
    filterEvents(summaries, { onlyAvailable: true }).map((event) => event.id),
    ['available', 'later'],
  );
});

test('S05: city matching is exact apart from capitalization', () => {
  const summaries = [
    { id: 'lagos', title: 'One', city: 'Lagos' },
    { id: 'lagos-state', title: 'Two', city: 'Lagos State' },
  ];
  assert.deepEqual(filterEvents(summaries, { city: 'LAGOS' }).map((event) => event.id), ['lagos']);
});

test('S05: bad dates, fractional prices, and unknown sorts return VALIDATION', () => {
  const summaries = makeSummaries();
  expectDomainCode(() => filterEvents(summaries, { from: 'not-a-date' }), 'VALIDATION');
  expectDomainCode(() => filterEvents(summaries, { maxPriceCents: 10.25 }), 'VALIDATION');
  expectDomainCode(() => sortEvents(summaries, 'popularity'), 'VALIDATION');
});

test('S05: filtering and sorting return new lists without changing the source', () => {
  const summaries = makeSummaries();
  const original = structuredClone(summaries);
  const filtered = filterEvents(summaries, { city: 'lagos' });
  const sorted = sortEvents(summaries, 'price');

  assert.notStrictEqual(filtered, summaries);
  assert.notStrictEqual(sorted, summaries);
  assert.deepEqual(summaries, original);
});

test('S05: availability sorting is descending and ties use title and id', () => {
  const summaries = [
    { id: 'c', title: 'Beta', availableSeats: 2 },
    { id: 'b', title: 'Alpha', availableSeats: 2 },
    { id: 'a', title: 'Alpha', availableSeats: 2 },
    { id: 'most', title: 'Zulu', availableSeats: 9 },
  ];

  assert.deepEqual(sortEvents(summaries, 'availability').map((event) => event.id), [
    'most',
    'a',
    'b',
    'c',
  ]);
});

test('S05: an empty input returns an empty new list for filtering, sorting, and searching', () => {
  const empty = [];
  assert.notStrictEqual(filterEvents(empty), empty);
  assert.notStrictEqual(sortEvents(empty, 'date'), empty);
  assert.deepEqual(searchEvents(empty, {}, 'price'), []);
});

test('mergeSort is stable and returns a new array without mutating its input', () => {
  const items = [
    { key: 1, order: 'first' },
    { key: 0, order: 'middle' },
    { key: 1, order: 'second' },
  ];
  const original = [...items];
  const sorted = mergeSort(items, (left, right) => left.key - right.key);

  assert.notStrictEqual(sorted, items);
  assert.deepEqual(sorted.map((item) => item.order), ['middle', 'first', 'second']);
  assert.deepEqual(items, original);
});

test('S06: a published event booking is pending, priced in cents, and releases the correct count', () => {
  const store = makeStore();
  const event = addEvent(store, {
    title: 'Ticketed event',
    tiers: [{ name: 'General', priceCents: 1200, capacity: 3 }],
    published: true,
  });
  const tier = [...event.tiers.values()][0];

  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Attendee',
    quantity: 2,
  });
  assert.equal(booking.status, 'pending');
  assert.equal(booking.totalCents, 2400);
  assert.equal(tier.remaining, 1);
  assert.equal(tier.sold, 2);
});

test('S06: booking more seats than remain returns SOLD_OUT without changing anything', () => {
  const store = makeStore();
  const event = addEvent(store, {
    title: 'Ticketed event',
    tiers: [{ name: 'General', priceCents: 1200, capacity: 1 }],
    published: true,
  });
  const tier = [...event.tiers.values()][0];
  const before = { remaining: tier.remaining, sold: tier.sold, bookings: store.bookingsByReference.size };

  expectDomainCode(
    () => bookTickets(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: 'Attendee',
      quantity: 2,
    }),
    'SOLD_OUT',
  );
  assert.deepEqual(
    { remaining: tier.remaining, sold: tier.sold, bookings: store.bookingsByReference.size },
    before,
  );
});

test('S06: quantities outside 1 through 10, including fractional values, return VALIDATION', () => {
  const store = makeStore();
  const event = addEvent(store, {
    title: 'Ticketed event',
    tiers: [{ name: 'General', priceCents: 1200, capacity: 20 }],
    published: true,
  });
  const tier = [...event.tiers.values()][0];

  for (const quantity of [0, -1, 1.5, 11]) {
    expectDomainCode(
      () => bookTickets(store, {
        eventId: event.id,
        tierId: tier.id,
        attendeeName: 'Attendee',
        quantity,
      }),
      'VALIDATION',
    );
  }
  assert.equal(tier.remaining, 20);
  assert.equal(store.bookingsByReference.size, 0);
});

test('existing waitlist and cancellation errors retain DomainError codes', () => {
  const store = makeStore();
  const event = addEvent(store, {
    title: 'Ticketed event',
    tiers: [{ name: 'General', priceCents: 1200, capacity: 1 }],
    published: true,
  });
  const tier = [...event.tiers.values()][0];
  expectDomainCode(
    () => joinWaitlist(store, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: 'Next',
      quantity: 1,
    }),
    'WAITLIST_NOT_NEEDED',
  );
  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Attendee',
    quantity: 1,
  });
  cancelBooking(store, booking.reference);
  expectDomainCode(() => cancelBooking(store, booking.reference), 'INVALID_STATE');
});
