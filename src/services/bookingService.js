import {
  bookTickets as bookDomainTickets,
  cancelBooking as cancelDomainBooking,
  createStore,
} from '../domain/inventory.js';
import { DomainError } from '../domain/errors.js';
import { assertTransition } from '../domain/bookingStateMachine.js';

function assertDependencies(repository, paymentGateway) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    typeof repository.findTier !== 'function' ||
    typeof repository.getEvent !== 'function' ||
    typeof repository.saveEvent !== 'function' ||
    typeof repository.getBooking !== 'function' ||
    typeof repository.listBookings !== 'function' ||
    typeof repository.saveBooking !== 'function'
  ) {
    throw new TypeError('A booking repository is required.');
  }
  if (paymentGateway === null || typeof paymentGateway?.charge !== 'function') {
    throw new TypeError('A payment gateway with charge() is required.');
  }
}

function requireBookingOwner(booking, userId) {
  if (booking.userId !== userId) {
    throw new DomainError('You are not allowed to access this booking.', 'FORBIDDEN');
  }
}

export function createBookingService(repository, paymentGateway) {
  assertDependencies(repository, paymentGateway);
  const paymentsInProgress = new Set();

  return {
    async create(input, userId) {
      if (typeof input?.tierId !== 'string' || input.tierId.trim() === '') {
        throw new DomainError('tierId must be a non-empty string.', 'VALIDATION');
      }
      const tierResult = await repository.findTier(input?.tierId);
      if (!tierResult) {
        throw new DomainError(`Ticket tier "${input?.tierId}" was not found.`, 'NOT_FOUND');
      }
      const domainStore = createStore();
      domainStore.events.set(tierResult.event.id, tierResult.event);
      for (const existingBooking of await repository.listBookings()) {
        domainStore.bookingsByReference.set(existingBooking.reference, existingBooking);
      }
      const booking = bookDomainTickets(domainStore, {
        eventId: tierResult.event.id,
        tierId: tierResult.tier.id,
        attendeeName: userId,
        quantity: input?.quantity,
      });
      booking.userId = userId;
      if (typeof repository.reserveSeats === 'function') {
        const reserved = await repository.reserveSeats(
          tierResult.event.id,
          tierResult.tier.id,
          booking.quantity,
        );
        if (!reserved) {
          const currentTier = await repository.getTier(
            tierResult.event.id,
            tierResult.tier.id,
          );
          if (!currentTier) {
            throw new DomainError(`Ticket tier "${tierResult.tier.id}" was not found.`, 'NOT_FOUND');
          }
          const message = currentTier.remaining === 0
            ? `The "${currentTier.name}" tier is sold out.`
            : `Only ${currentTier.remaining} ticket(s) remain in the "${currentTier.name}" tier.`;
          throw new DomainError(message, 'SOLD_OUT');
        }
      } else {
        await repository.saveEvent(tierResult.event);
      }
      await repository.saveBooking(booking);
      return booking;
    },

    async pay(reference, input, userId) {
      const booking = await repository.getBooking(reference);
      if (!booking) {
        throw new DomainError(`Booking "${reference}" was not found.`, 'NOT_FOUND');
      }
      requireBookingOwner(booking, userId);
      if (paymentsInProgress.has(reference)) {
        throw new DomainError('A payment is already in progress for this booking.', 'INVALID_TRANSITION');
      }
      assertTransition(booking.status, 'paid');

      const paymentToken = input?.paymentToken;
      if (paymentToken !== 'tok_success' && paymentToken !== 'tok_declined') {
        throw new DomainError('paymentToken must be tok_success or tok_declined.', 'VALIDATION');
      }
      paymentsInProgress.add(reference);
      try {
        const result = await paymentGateway.charge({
          amountCents: booking.totalCents,
          decline: paymentToken === 'tok_declined',
        });
        if (!result.success) {
          throw new DomainError('The mock payment was declined.', 'PAYMENT_DECLINED');
        }

        booking.status = 'paid';
        booking.paymentId = result.transactionId;
        await repository.saveBooking(booking);
        return booking;
      } finally {
        paymentsInProgress.delete(reference);
      }
    },

    async cancel(reference, userId) {
      const booking = await repository.getBooking(reference);
      if (!booking) {
        throw new DomainError(`Booking "${reference}" was not found.`, 'NOT_FOUND');
      }
      requireBookingOwner(booking, userId);
      if (booking.status !== 'pending') {
        throw new DomainError('Only pending bookings can be cancelled in this build.', 'INVALID_STATE');
      }
      assertTransition(booking.status, 'cancelled');
      const event = await repository.getEvent(booking.eventId);
      if (!event) {
        throw new DomainError(`Event "${booking.eventId}" was not found.`, 'NOT_FOUND');
      }
      const domainStore = createStore();
      domainStore.events.set(event.id, event);
      domainStore.bookingsByReference.set(booking.reference, booking);
      cancelDomainBooking(domainStore, reference);
      await repository.saveEvent(event);
      await repository.saveBooking(booking);
      return booking;
    },
  };
}
