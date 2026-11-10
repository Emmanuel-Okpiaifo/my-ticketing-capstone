import {
  addTier as addDomainTier,
  createEvent as createDomainEvent,
  createStore,
  listEventSummaries,
  publishEvent as publishDomainEvent,
  unpublishEvent as unpublishDomainEvent,
} from '../domain/inventory.js';
import { DomainError } from '../domain/errors.js';
import { searchEvents } from '../domain/eventSearch.js';

function assertRepository(repository) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.saveEvent !== 'function' ||
    typeof repository.getEvent !== 'function' ||
    typeof repository.listEvents !== 'function' ||
    typeof repository.saveTier !== 'function'
  ) {
    throw new TypeError('An event repository is required.');
  }
}

function requireOwner(event, userId) {
  if (event.organizerId !== userId) {
    throw new DomainError('You are not allowed to manage this event.', 'FORBIDDEN');
  }
}

function summaryForApi(summary) {
  const { date, ...event } = summary;
  return { ...event, startsAt: date };
}

export function createEventService(repository) {
  assertRepository(repository);

  return {
    async create(input, organizerId) {
      const domainStore = createStore();
      const event = createDomainEvent(domainStore, {
        title: input?.title,
        city: input?.city,
        venue: input?.venue,
        date: input?.startsAt ?? input?.date,
      });
      event.organizerId = organizerId;
      await repository.saveEvent(event);
      return summaryForApi(listEventSummaries(domainStore, { publishedOnly: false })
        .find((summary) => summary.id === event.id));
    },

    async addTier(eventId, input, organizerId) {
      const event = await repository.getEvent(eventId);
      if (!event) {
        throw new DomainError(`Event "${eventId}" was not found.`, 'NOT_FOUND');
      }
      requireOwner(event, organizerId);
      const domainStore = createStore();
      domainStore.events.set(event.id, event);
      const tier = addDomainTier(domainStore, eventId, input);
      await repository.saveTier(eventId, tier);
      return {
        id: tier.id,
        eventId,
        name: tier.name,
        priceCents: tier.priceCents,
        capacity: tier.capacity,
        sold: tier.sold,
        seatsLeft: tier.remaining,
      };
    },

    async publish(eventId, organizerId) {
      const event = await repository.getEvent(eventId);
      if (!event) {
        throw new DomainError(`Event "${eventId}" was not found.`, 'NOT_FOUND');
      }
      requireOwner(event, organizerId);
      const domainStore = createStore();
      domainStore.events.set(event.id, event);
      publishDomainEvent(domainStore, eventId);
      await repository.saveEvent(event);
      return { id: event.id, status: 'published' };
    },

    async unpublish(eventId, organizerId) {
      const event = await repository.getEvent(eventId);
      if (!event) {
        throw new DomainError(`Event "${eventId}" was not found.`, 'NOT_FOUND');
      }
      requireOwner(event, organizerId);
      const domainStore = createStore();
      domainStore.events.set(event.id, event);
      unpublishDomainEvent(domainStore, eventId);
      await repository.saveEvent(event);
      return { id: event.id, status: 'draft' };
    },

    async list(query) {
      const domainStore = createStore();
      const events = await repository.listEvents();
      for (const event of events) {
        domainStore.events.set(event.id, event);
      }
      const summaries = listEventSummaries(domainStore);
      const criteria = {};
      if (query.has('q')) criteria.q = query.get('q');
      if (query.has('city')) criteria.city = query.get('city');
      if (query.has('from')) criteria.from = query.get('from');
      if (query.has('to')) criteria.to = query.get('to');
      if (query.has('maxPriceCents')) {
        const maxPriceCents = query.get('maxPriceCents');
        if (!/^\d+$/.test(maxPriceCents)) {
          throw new DomainError('maxPriceCents must be a whole number of cents.', 'VALIDATION');
        }
        criteria.maxPriceCents = Number(maxPriceCents);
      }
      if (query.has('onlyAvailable')) {
        const onlyAvailable = query.get('onlyAvailable');
        if (onlyAvailable !== 'true' && onlyAvailable !== 'false') {
          throw new DomainError('onlyAvailable must be true or false.', 'VALIDATION');
        }
        criteria.onlyAvailable = onlyAvailable === 'true';
      }
      const sortBy = query.get('sort') ?? 'date';
      return searchEvents(summaries, criteria, sortBy).map(summaryForApi);
    },
  };
}
