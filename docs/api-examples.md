# Build 4 in-memory API

Start the API from the project root:

```bash
npm start
```

It listens at `http://localhost:3000`. Data is held in memory and is cleared
when the server stops. Until Build 7 adds login, send an `x-user-id` header on
requests that create or manage a resource. Use the same id to manage an event
and to pay for or cancel a booking you created.

The examples use `curl` and shell variables. Copy each returned `id` or
`reference` into the corresponding variable before continuing.

## 1. Create an event

```bash
curl -i -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Landmark Centre","startsAt":"2026-12-05T17:00:00Z"}'
```

The response contains the event `id` and starts in draft state. Set
`EVENT_ID` to that value (replace the placeholder with the copied id):

```bash
EVENT_ID='paste-event-id-here'
```

## 2. Add a ticket tier

```bash
curl -i -X POST "http://localhost:3000/api/events/$EVENT_ID/tiers" \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
```

`priceCents` is a whole number of cents (or kobo). The response contains the
tier `id`; set `TIER_ID` to it.

```bash
TIER_ID='paste-tier-id-here'
```

## 3. Publish the event

```bash
curl -i -X POST "http://localhost:3000/api/events/$EVENT_ID/publish" \
  -H 'x-user-id: organizer-1'
```

An event needs at least one tier before it can be published.

## 4. Search published events

All query parameters are optional: `q`, `city`, `from`, `to`,
`maxPriceCents`, `onlyAvailable` (`true` or `false`), and `sort` (`date`,
`price`, or `availability`).

```bash
curl -i 'http://localhost:3000/api/events?city=lagos&maxPriceCents=600000&sort=price'
```

The response is `{"events":[...]}`. Draft events are not included.

## 5. Book tickets

```bash
curl -i -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d "{\"tierId\":\"$TIER_ID\",\"quantity\":2}"
```

The response contains a pending booking, `totalCents`, and a `reference`; set
`REFERENCE` to the returned reference. A booking can contain 1 to 10 tickets.
Replace the placeholder with the copied reference:

```bash
REFERENCE='paste-booking-reference-here'
```

## 6. Pay for the booking

The mock payment accepts `tok_success` and `tok_declined`. It never receives a
card number. A decline leaves the booking pending, so you can retry:

```bash
curl -i -X POST "http://localhost:3000/api/bookings/$REFERENCE/pay" \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d '{"paymentToken":"tok_declined"}'
```

That call returns `PAYMENT_DECLINED`. Pay successfully with:

```bash
curl -i -X POST "http://localhost:3000/api/bookings/$REFERENCE/pay" \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d '{"paymentToken":"tok_success"}'
```

The response has `"status":"paid"`. A booking can only be paid by its
attendee; trying to pay again is rejected without charging again.

## 7. Cancel an unpaid booking

Create a second booking as in step 5 and set `REFERENCE` to its reference.
Cancel it while it is still pending:

```bash
curl -i -X POST "http://localhost:3000/api/bookings/$REFERENCE/cancel" \
  -H 'x-user-id: attendee-1'
```

Only pending bookings can be cancelled in this build. Their seats are returned
to the tier.

## Errors and health

Errors have the same JSON shape, for example:

```json
{"error":{"code":"SOLD_OUT","message":"Only 1 ticket(s) remain in the \"General\" tier."}}
```

Check that the server is running:

```bash
curl -i http://localhost:3000/health
```
