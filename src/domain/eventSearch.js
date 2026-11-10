import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

const SORT_OPTIONS = new Set(['date', 'price', 'availability']);
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/i;

function assertSummaries(summaries) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('Event summaries must be an array.', 'VALIDATION');
  }
  for (const summary of summaries) {
    if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) {
      throw new DomainError('Each event summary must be an object.', 'VALIDATION');
    }
    if (summary.tiers !== undefined && !Array.isArray(summary.tiers)) {
      throw new DomainError('Event summary tiers must be an array.', 'VALIDATION');
    }
  }
}

function assertCriteria(criteria) {
  if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new DomainError('Search criteria must be an object.', 'VALIDATION');
  }
}

function parseIsoDate(value, label) {
  if (typeof value !== 'string') {
    throw new DomainError(`${label} must be an ISO date string.`, 'VALIDATION');
  }

  const match = DATE_ONLY_PATTERN.exec(value) ?? ISO_DATE_TIME_PATTERN.exec(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const datePart = new Date(0);
  datePart.setUTCHours(0, 0, 0, 0);
  datePart.setUTCFullYear(year, month - 1, day);
  if (
    !match ||
    datePart.getUTCFullYear() !== year ||
    datePart.getUTCMonth() !== month - 1 ||
    datePart.getUTCDate() !== day
  ) {
    throw new DomainError(`${label} must be a valid ISO date.`, 'VALIDATION');
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new DomainError(`${label} must be a valid ISO date.`, 'VALIDATION');
  }
  return {
    timestamp,
    isDateOnly: DATE_ONLY_PATTERN.test(value),
  };
}

function normalizedText(value, label) {
  if (typeof value !== 'string') {
    throw new DomainError(`${label} must be a string.`, 'VALIDATION');
  }
  return value.trim().toLocaleLowerCase();
}

function tierPrices(summary) {
  const declaredPrice = summary.cheapestPriceCents;
  if (
    declaredPrice !== undefined &&
    declaredPrice !== null &&
    (!Number.isSafeInteger(declaredPrice) || declaredPrice < 0)
  ) {
    throw new DomainError('Event prices must be whole non-negative cents.', 'VALIDATION');
  }
  if (Array.isArray(summary.tiers)) {
    return summary.tiers.map((tier) => {
      if (
        tier === null ||
        typeof tier !== 'object' ||
        !Number.isSafeInteger(tier.priceCents) ||
        tier.priceCents < 0
      ) {
        throw new DomainError('Ticket tier prices must be whole non-negative cents.', 'VALIDATION');
      }
      return tier.priceCents;
    });
  }
  const price = declaredPrice ?? summary.minPriceCents ?? summary.priceCents;
  if (price !== undefined && (!Number.isSafeInteger(price) || price < 0)) {
    throw new DomainError('Event prices must be whole non-negative cents.', 'VALIDATION');
  }
  return Number.isSafeInteger(price) && price >= 0 ? [price] : [];
}

function cheapestPrice(summary) {
  const prices = tierPrices(summary);
  if (summary.cheapestPriceCents !== undefined && summary.cheapestPriceCents !== null) {
    return summary.cheapestPriceCents;
  }
  return prices.length === 0 ? null : prices.reduce((minimum, price) => Math.min(minimum, price));
}

function availableSeats(summary) {
  if (
    summary.availableSeats !== undefined &&
    (!Number.isSafeInteger(summary.availableSeats) || summary.availableSeats < 0)
  ) {
    throw new DomainError('Available seats must be a non-negative whole number.', 'VALIDATION');
  }
  if (summary.availableSeats !== undefined) {
    return summary.availableSeats;
  }
  if (Array.isArray(summary.tiers)) {
    return summary.tiers.reduce((total, tier) => {
      if (tier === null || typeof tier !== 'object') {
        throw new DomainError('Each ticket tier must be an object.', 'VALIDATION');
      }
      if (tier.remaining !== undefined) {
        if (!Number.isSafeInteger(tier.remaining) || tier.remaining < 0) {
          throw new DomainError('Tier seats remaining must be a non-negative whole number.', 'VALIDATION');
        }
        return total + tier.remaining;
      }
      if (tier.capacity === undefined && tier.sold === undefined) {
        return total;
      }
      if (
        !Number.isSafeInteger(tier.capacity) ||
        tier.capacity < 0 ||
        !Number.isSafeInteger(tier.sold) ||
        tier.sold < 0 ||
        tier.sold > tier.capacity
      ) {
        throw new DomainError('Tier capacity and sold seats must be valid whole numbers.', 'VALIDATION');
      }
      return total + tier.capacity - tier.sold;
    }, 0);
  }
  return 0;
}

function titleCompare(left, right) {
  const leftTitle = String(left.title ?? left.name ?? '');
  const rightTitle = String(right.title ?? right.name ?? '');
  if (leftTitle !== rightTitle) {
    return leftTitle < rightTitle ? -1 : 1;
  }
  const leftId = String(left.id ?? '');
  const rightId = String(right.id ?? '');
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function filterEvents(summaries, criteria = {}) {
  assertSummaries(summaries);
  assertCriteria(criteria);

  const query = criteria.q === undefined ? null : normalizedText(criteria.q, 'Search query');
  const city = criteria.city === undefined ? null : normalizedText(criteria.city, 'City');
  const from = criteria.from === undefined ? null : parseIsoDate(criteria.from, 'From date');
  const to = criteria.to === undefined ? null : parseIsoDate(criteria.to, 'To date');
  if (
    criteria.maxPriceCents !== undefined &&
    (!Number.isSafeInteger(criteria.maxPriceCents) || criteria.maxPriceCents < 0)
  ) {
    throw new DomainError('Maximum price must be a non-negative whole number of cents.', 'VALIDATION');
  }
  if (criteria.onlyAvailable !== undefined && typeof criteria.onlyAvailable !== 'boolean') {
    throw new DomainError('onlyAvailable must be a boolean.', 'VALIDATION');
  }

  const toTimestamp = to?.isDateOnly
    ? to.timestamp + 24 * 60 * 60 * 1000 - 1
    : to?.timestamp;

  return summaries.filter((summary) => {
    if (query !== null) {
      const title = String(summary.title ?? summary.name ?? '').toLocaleLowerCase();
      const venue = String(summary.venue ?? '').toLocaleLowerCase();
      if (!title.includes(query) && !venue.includes(query)) {
        return false;
      }
    }

    if (city !== null && String(summary.city ?? '').trim().toLocaleLowerCase() !== city) {
      return false;
    }

    if (from !== null || to !== null) {
      const eventDate = parseIsoDate(summary.date, 'Event date').timestamp;
      if (from !== null && eventDate < from.timestamp) {
        return false;
      }
      if (toTimestamp !== undefined && eventDate > toTimestamp) {
        return false;
      }
    }

    if (criteria.maxPriceCents !== undefined) {
      const price = cheapestPrice(summary);
      if (price === null || price > criteria.maxPriceCents) {
        return false;
      }
    }

    if (criteria.onlyAvailable === true && availableSeats(summary) <= 0) {
      return false;
    }

    return true;
  });
}

export function sortEvents(summaries, sortBy) {
  assertSummaries(summaries);
  if (!SORT_OPTIONS.has(sortBy)) {
    throw new DomainError(`Unknown event sort option "${sortBy}".`, 'VALIDATION');
  }
  if (sortBy === 'date') {
    for (const summary of summaries) {
      parseIsoDate(summary.date, 'Event date');
    }
  } else if (sortBy === 'price') {
    for (const summary of summaries) {
      cheapestPrice(summary);
    }
  } else {
    for (const summary of summaries) {
      availableSeats(summary);
    }
  }

  return mergeSort(summaries, (left, right) => {
    let comparison = 0;
    if (sortBy === 'date') {
      comparison =
        parseIsoDate(left.date, 'Event date').timestamp -
        parseIsoDate(right.date, 'Event date').timestamp;
    } else if (sortBy === 'price') {
      const leftPrice = cheapestPrice(left);
      const rightPrice = cheapestPrice(right);
      if (leftPrice === null || rightPrice === null) {
        comparison = leftPrice === rightPrice ? 0 : leftPrice === null ? 1 : -1;
      } else {
        comparison = leftPrice - rightPrice;
      }
    } else {
      comparison = availableSeats(right) - availableSeats(left);
    }
    return comparison || titleCompare(left, right);
  });
}

export function searchEvents(summaries, criteria, sortBy) {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
