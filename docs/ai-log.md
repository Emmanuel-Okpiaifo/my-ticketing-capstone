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

## Build 5: SQLite and the overselling fix

**Tool:** GitHub Copilot (VS Code)

**What I asked for:** Prompt 1 (move to node:sqlite with constraints, a repository with the same methods as memory.js, a seed script, and an oversell demo without fixing anything) and Prompt 2 (fix it in the database with one atomic UPDATE and add a test). I also asked it to keep the database file out of git.

**What it produced:** schema.sql with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK (sold >= 0 AND sold <= capacity); a SQLite repository using ? placeholders everywhere; seed and oversell scripts; reserveSeats using UPDATE ... SET sold = sold + ? WHERE ... AND sold + ? <= capacity and checking result.changes; test/oversell.test.js; and a restart test showing the data survives.

**Results:** Before the fix, 50 of 50 bookings succeeded but only 1 seat was recorded as sold. After the fix, 1 succeeded, 49 got SOLD_OUT, and 1 seat was sold. With the fix removed, the oversell test fails (50 bookings instead of 1).

**What it got wrong:**
- It said the CHECK constraint kept sold at 1 before the fix. It was really a lost update: all 50 requests read sold = 0 and each wrote sold = 1, so 49 sales were overwritten without any error. The CHECK never fired.
- node:sqlite is synchronous, so it added a setImmediate delay in findTier to make the race happen. I kept it because real async drivers have the same gap between reading and writing, and the test needs it to fail when the fix is removed, but the delay is artificial.
- The SOLD_OUT message for the losing requests used the stale count ("Only 1 ticket(s) remain"). I had it re-read the tier for the message.
- It went straight through Prompt 2 without stopping after Prompt 1, so I checked the "before" numbers in its report.

**What I learned:** Reading a value, then saving a new value calculated in JavaScript, loses updates under concurrency. The condition and the change have to happen in one SQL statement, and the number of changed rows tells you who won. A lock variable only works inside one process, and checking twice still leaves a gap.