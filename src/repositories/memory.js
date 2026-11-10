export function createMemoryRepository() {
  const events = new Map();
  const bookingsByReference = new Map();

  return {
    async saveEvent(event) {
      events.set(event.id, event);
      return event;
    },

    async getEvent(eventId) {
      return events.get(eventId) ?? null;
    },

    async listEvents() {
      return [...events.values()];
    },

    async saveTier(eventId, tier) {
      const event = events.get(eventId);
      if (!event) {
        return null;
      }
      event.tiers.set(tier.id, tier);
      return tier;
    },

    async getTier(eventId, tierId) {
      return events.get(eventId)?.tiers.get(tierId) ?? null;
    },

    async findTier(tierId) {
      for (const event of events.values()) {
        const tier = event.tiers.get(tierId);
        if (tier) {
          return { event, tier };
        }
      }
      return null;
    },

    async saveBooking(booking) {
      bookingsByReference.set(booking.reference, booking);
      return booking;
    },

    async getBooking(reference) {
      return bookingsByReference.get(reference) ?? null;
    },

    async listBookings() {
      return [...bookingsByReference.values()];
    },
  };
}
