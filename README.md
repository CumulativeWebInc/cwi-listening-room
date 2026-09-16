# CWI Listening Room

Scheduled shared listening sessions for the CWI catalog — agents and humans pressing play together, in real time. Product #36 in the CWI software brand.

**Live:** https://cumulativewebinc.github.io/cwi-listening-room/

## What's real here

- **Real scheduled times.** Four weekly sessions, Fridays 8:00 PM ET, computed against the real clock. A session is `live` only inside its 90-minute window.
- **Real Spotify playback** on your own account via official embeds. Setlists use verified Spotify track IDs from `catalog.json` (cwi.catalog/2.0).
- **Real device-local RSVPs.** "I'll be there" saves to your device's localStorage only. We never show attendee counts we can't verify.
- **No fake "now playing."** The synchronization ritual is honest: everyone presses play on track 1 at the top of the hour.
- **Listening spotlights.** Catalog tracks with no verified Spotify link on file (King Akeem, 183 Wildboi, Dre50) appear as labeled text-only spotlights — never embedded, never faked.

## For agents

- `sessions.json` — machine-readable schedule (status computed from the clock, never stored)
- `schema/sessions.schema.json` — `cwi.listening-session/1.0`
- Deep links: `?session=<id>`
- i18n tables: `https://cumulativewebinc.github.io/cwi-i18n/tables/listening-room/<lang>.json`

## Sessions (seeded 2026-09-16)

| Session | Date (ET) | Theme |
|---|---|---|
| victory-lap-2026-09-18 | Fri 2026-09-18 8:00 PM | New Rap Hits Victory Lap |
| king-akeem-deep-dive-2026-09-25 | Fri 2026-09-25 8:00 PM | King Akeem Deep Dive |
| wildboi-rock-rap-2026-10-02 | Fri 2026-10-02 8:00 PM | 183 Wildboi Rock-Rap Night |
| dre50-global-vibes-2026-10-09 | Fri 2026-10-09 8:00 PM | Dre50 Global Vibes |

## Tests

`node --test tests/test.js` — 24/24 green. Covers session status computation (incl. timezone edges), ICS validity, RSVP store, deep links, setlist integrity vs the live catalog, schema shape, and i18n key coverage (en/es/pt-BR/fr/de/ja).

## Honest-labels wording (shipped)

- Page banner: "Everything here is real: real scheduled times, real Spotify playback on your own account, real device-local RSVPs. We never show attendee counts we can't verify and never fake a 'now playing' state."
- RSVP: "Saved on this device only — not a global attendance count. We never publish how many people are coming."
- Spotlight: "listening spotlight — no verified Spotify link on file"
- Ritual: "at session time, everyone presses play on track 1 at the top of the hour. No fake sync — just humans and agents listening together, for real."

Cumulative Web Inc · hp@cumulativeweb.com
