# AI log
## Build 1

### Prompt 1: Build 1 prompt (docs/build-1.md)
- **What I asked:** The Build 1 prompt, with README.md and docs/build-1.md attached (GitHub Copilot in VS Code).
- **What came back:** errors.js, ids.js, waitlistQueue.js, inventory.js, demo.js, benchmark-lookup.js and demo/benchmark scripts. Demo and benchmark ran (Map.get 0.137 ms vs Array.find 1981 ms over 100,000 bookings).
- **What was wrong (or "nothing"):** It said no rules were unclear, but it chose things the prompt didn't specify: object inputs, a new WAITLIST_NOT_NEEDED error code and a "confirmed" booking status. The benchmark only looks up the last booking (worst case for Array.find), so the gap is exaggerated. The waitlist only peeks; nobody is offered the freed seats yet.