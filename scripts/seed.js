import {
  addTier,
  createEvent,
  createStore,
  publishEvent,
} from '../src/domain/inventory.js';
import { DATABASE_PATH } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/connection.js';
import { createSQLiteRepository } from '../src/repositories/sqlite.js';

const database = openDatabase(DATABASE_PATH);

try {
  const repository = createSQLiteRepository(database);
  if ((await repository.listEvents()).length > 0) {
    console.log('Database already has events; seed skipped.');
  } else {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Landmark Centre',
      date: '2026-12-05T17:00:00Z',
    });
    event.organizerId = 'seed-organizer';
    await repository.saveEvent(event);
    const tier = addTier(store, event.id, {
      name: 'General',
      priceCents: 500000,
      capacity: 100,
    });
    await repository.saveTier(event.id, tier);
    publishEvent(store, event.id);
    await repository.saveEvent(event);
    console.log(`Seeded event ${event.id} with tier ${tier.id}.`);
  }
} finally {
  closeDatabase(database);
}
