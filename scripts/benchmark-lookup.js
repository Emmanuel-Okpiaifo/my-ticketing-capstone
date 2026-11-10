import { performance } from 'node:perf_hooks';

const BOOKINGS = 100_000;
const LOOKUPS = 500;
const bookings = Array.from({ length: BOOKINGS }, (_, index) => ({
  reference: `BOOK-${index}`,
}));
const bookingsByReference = new Map(
  bookings.map((booking) => [booking.reference, booking]),
);
const targetReference = bookings[BOOKINGS - 1].reference;

function timeLookups(lookup) {
  const start = performance.now();
  let found;
  for (let index = 0; index < LOOKUPS; index += 1) {
    found = lookup(targetReference);
  }
  return { elapsedMs: performance.now() - start, found };
}

const mapResult = timeLookups((reference) => bookingsByReference.get(reference));
const arrayResult = timeLookups((reference) =>
  bookings.find((booking) => booking.reference === reference),
);

if (!mapResult.found || !arrayResult.found) {
  throw new Error('Benchmark lookup failed to find its target booking.');
}

console.log(`Bookings: ${BOOKINGS.toLocaleString()}; lookups: ${LOOKUPS}`);
console.log(`Map.get:    ${mapResult.elapsedMs.toFixed(3)} ms`);
console.log(`Array.find: ${arrayResult.elapsedMs.toFixed(3)} ms`);
