import { Queue } from '../domain/waitlistQueue.js';

function mapTier(row) {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
    remaining: row.capacity - row.sold,
    waitlist: new Queue(),
  };
}

function loadEvent(database, row) {
  if (!row) {
    return null;
  }
  const event = {
    id: row.id,
    title: row.title,
    name: row.title,
    city: row.city,
    venue: row.venue,
    date: row.starts_at,
    published: row.published === 1,
    organizerId: row.organizer_id,
    tiers: new Map(),
  };
  const tierRows = database.prepare(
    'SELECT id, name, price_cents, capacity, sold FROM ticket_tiers WHERE event_id = ?',
  ).all(event.id);
  for (const tierRow of tierRows) {
    const tier = mapTier(tierRow);
    event.tiers.set(tier.id, tier);
  }
  return event;
}

function mapBooking(row) {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    eventId: row.event_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
    ...(row.payment_id === null ? {} : { paymentId: row.payment_id }),
  };
}

export function createSQLiteRepository(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new TypeError('An open SQLite database is required.');
  }

  const ensureUser = database.prepare(
    'INSERT OR IGNORE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)',
  );
  const findEvent = database.prepare(
    'SELECT id, organizer_id, title, city, venue, starts_at, published FROM events WHERE id = ?',
  );

  return {
    async saveEvent(event) {
      ensureUser.run(
        event.organizerId,
        event.organizerId,
        `${event.organizerId}@local.invalid`,
        'organizer',
      );
      database.prepare(`
        INSERT INTO events (id, organizer_id, title, city, venue, starts_at, published)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organizer_id = excluded.organizer_id,
          title = excluded.title,
          city = excluded.city,
          venue = excluded.venue,
          starts_at = excluded.starts_at,
          published = excluded.published
      `).run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue,
        event.date,
        event.published ? 1 : 0,
      );

      const updateTier = database.prepare(
        'UPDATE ticket_tiers SET name = ?, price_cents = ?, capacity = ?, sold = ? WHERE id = ? AND event_id = ?',
      );
      for (const tier of event.tiers.values()) {
        updateTier.run(
          tier.name,
          tier.priceCents,
          tier.capacity,
          tier.sold,
          tier.id,
          event.id,
        );
      }
      return event;
    },

    async getEvent(eventId) {
      return loadEvent(database, findEvent.get(eventId));
    },

    async listEvents() {
      const rows = database.prepare(
        'SELECT id, organizer_id, title, city, venue, starts_at, published FROM events',
      ).all();
      return rows.map((row) => loadEvent(database, row));
    },

    async saveTier(eventId, tier) {
      database.prepare(`
        INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          price_cents = excluded.price_cents,
          capacity = excluded.capacity,
          sold = excluded.sold
      `).run(
        tier.id,
        eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.sold,
      );
      return tier;
    },

    async getTier(eventId, tierId) {
      const row = database.prepare(
        'SELECT id, name, price_cents, capacity, sold FROM ticket_tiers WHERE event_id = ? AND id = ?',
      ).get(eventId, tierId);
      return row ? mapTier(row) : null;
    },

    async reserveSeats(eventId, tierId, quantity) {
      const result = database.prepare(
        'UPDATE ticket_tiers SET sold = sold + ? WHERE event_id = ? AND id = ? AND sold + ? <= capacity',
      ).run(quantity, eventId, tierId, quantity);
      return result.changes === 1;
    },

    async findTier(tierId) {
      const row = database.prepare(
        'SELECT event_id FROM ticket_tiers WHERE id = ?',
      ).get(tierId);
      if (!row) {
        return null;
      }
      const event = loadEvent(database, findEvent.get(row.event_id));
      // Preserve the asynchronous read/write gap so the pre-fix race can be reproduced.
      await new Promise((resolve) => setImmediate(resolve));
      return event ? { event, tier: event.tiers.get(tierId) } : null;
    },

    async saveBooking(booking) {
      ensureUser.run(
        booking.userId,
        booking.userId,
        `${booking.userId}@local.invalid`,
        'attendee',
      );
      database.prepare(`
        INSERT INTO bookings (
          id, reference, user_id, event_id, tier_id, quantity, total_cents, status, payment_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reference) DO UPDATE SET
          user_id = excluded.user_id,
          event_id = excluded.event_id,
          tier_id = excluded.tier_id,
          quantity = excluded.quantity,
          total_cents = excluded.total_cents,
          status = excluded.status,
          payment_id = excluded.payment_id
      `).run(
        booking.id,
        booking.reference,
        booking.userId,
        booking.eventId,
        booking.tierId,
        booking.quantity,
        booking.totalCents,
        booking.status,
        booking.paymentId ?? null,
      );
      return booking;
    },

    async getBooking(reference) {
      const row = database.prepare(`
        SELECT id, reference, user_id, event_id, tier_id, quantity, total_cents, status, payment_id
        FROM bookings WHERE reference = ?
      `).get(reference);
      return row ? mapBooking(row) : null;
    },

    async listBookings() {
      const rows = database.prepare(`
        SELECT id, reference, user_id, event_id, tier_id, quantity, total_cents, status, payment_id
        FROM bookings
      `).all();
      return rows.map(mapBooking);
    },
  };
}
