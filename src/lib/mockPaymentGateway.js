import { randomUUID } from 'node:crypto';

export function createMockPaymentGateway() {
  return {
    async charge({ amountCents, decline = false }) {
      if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
        throw new TypeError('Payment amount must be a non-negative whole number of cents.');
      }
      if (decline) {
        return { success: false };
      }
      return { success: true, transactionId: randomUUID() };
    },
  };
}
