# AI log
## Build 1

### Prompt 1: Build 1 prompt (docs/build-1.md)
- **What I asked:** The Build 1 prompt, with README.md and docs/build-1.md attached (GitHub Copilot in VS Code).
- **What came back:** errors.js, ids.js, waitlistQueue.js, inventory.js, demo.js, benchmark-lookup.js and demo/benchmark scripts. Demo and benchmark ran (Map.get 0.137 ms vs Array.find 1981 ms over 100,000 bookings).
- **What was wrong (or "nothing"):** It said no rules were unclear, but it chose things the prompt didn't specify: object inputs, a new WAITLIST_NOT_NEEDED error code and a "confirmed" booking status. The benchmark only looks up the last booking (worst case for Array.find), so the gap is exaggerated. The waitlist only peeks; nobody is offered the freed seats yet.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** The Build 2 prompt with README.md, user-stories.md, build-2.md and src/domain/ attached.
- **What came back:** sorting.js (merge sort), eventSearch.js, publishEvent/unpublishEvent/listEventSummaries, 25 tests. npm test passed.
- **What was wrong (or "nothing"):** It stopped to ask about S04 because the criteria were still a placeholder, so I wrote them. Its first edit to build-2.md failed and one test was set up wrong (it ran after the tier sold out); it fixed both. It let draft events be booked, which breaks S06, so I asked for a fix.

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** The Build 3 prompt with README.md, user-stories.md, build-3.md and src/domain/ attached.
- **What came back:** bookingStateMachine.js, src/http/router.js and app.js, config.js, server.js, public/index.html, build-3.test.js and a start script. 32 tests passed and /health answered on a real port.
- **What was wrong (or "nothing"):** It did not write docs/architecture.md because a copy from the course repo was already there, so the diagrams are the course's, not generated or written by me. That file's data model describes the planned design (status, starts_at, users), not the current code (published, date). Two of its patches failed first time (file already existed, package.json lines changed) before it retried. The state machine is not used by cancelBooking yet.

## Build 4: Working REST API (in memory)

**Tool:** GitHub Copilot (VS Code)

**What I asked for:** The Build 4 prompt from docs/build-4.md, plus an extra line asking it to rewrite docs/api-examples.md, because that file described Build 5 (database) instead of the in-memory API.

**What it produced:** An in-memory repository, eventService and bookingService, a mock payment gateway (tok_success / tok_declined), API routes in src/http/routes.js, and API tests. Bookings belong to the x-user-id caller, and anyone else gets FORBIDDEN. Pay and cancel go through the booking state machine.

**What it got wrong:**
- Two pay requests sent at the same moment both succeeded and charged the card twice, which breaks S07 ("charged only once"). Both requests passed the status check before either one marked the booking paid. Its tests only covered paying twice one after the other, so they missed this.
- It left out the unpublish endpoint, so S04 could not be done through the API.

**How I fixed it:** I asked it to mark a booking as "payment in progress" before charging, reject a second request with INVALID_TRANSITION, and clear the mark on decline so the attendee can retry. I also asked for POST /api/events/:id/unpublish (organizer only), with tests and a curl example. Added a Promise.all test that checks for exactly one success and one charge. 37 tests passing.

**What I learned:** A check followed by an await is a race window. Tests that run steps one after another won't catch it, so concurrency needs its own test that fires requests at the same time. The same problem comes back with the last seat in Build 5.