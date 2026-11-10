import { DomainError } from '../domain/errors.js';

function requireUserId(request) {
  const userId = request.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new DomainError('The x-user-id header is required.', 'UNAUTHENTICATED');
  }
  return userId.trim();
}

export function registerApiRoutes(router, { eventService, bookingService }) {
  router.add('POST', '/api/events', async ({ request, body }) => ({
    statusCode: 201,
    body: await eventService.create(body, requireUserId(request)),
  }));
  router.add('POST', '/api/events/:id/tiers', async ({ request, params, body }) => ({
    statusCode: 201,
    body: await eventService.addTier(params.id, body, requireUserId(request)),
  }));
  router.add('POST', '/api/events/:id/publish', async ({ request, params }) => ({
    statusCode: 200,
    body: await eventService.publish(params.id, requireUserId(request)),
  }));
  router.add('POST', '/api/events/:id/unpublish', async ({ request, params }) => ({
    statusCode: 200,
    body: await eventService.unpublish(params.id, requireUserId(request)),
  }));
  router.add('GET', '/api/events', async ({ query }) => ({
    statusCode: 200,
    body: { events: await eventService.list(query) },
  }));
  router.add('POST', '/api/bookings', async ({ request, body }) => ({
    statusCode: 201,
    body: await bookingService.create(body, requireUserId(request)),
  }));
  router.add('POST', '/api/bookings/:reference/pay', async ({ request, params, body }) => ({
    statusCode: 200,
    body: await bookingService.pay(params.reference, body, requireUserId(request)),
  }));
  router.add('POST', '/api/bookings/:reference/cancel', async ({ request, params }) => ({
    statusCode: 200,
    body: await bookingService.cancel(params.reference, requireUserId(request)),
  }));
}
