/* CWI Listening Room tests — real logic, fixtures only. node --test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BUILD = path.dirname(__dirname);
const Room = require(path.join(BUILD, "room.js"));
const sessionsDoc = JSON.parse(fs.readFileSync(path.join(BUILD, "sessions.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync("/tmp/catalog2.json", "utf8"));

// ---------- session status ----------
test("status: upcoming before start", () => {
  const s = sessionsDoc.sessions[0]; // 2026-09-18T20:00:00-04:00
  const before = new Date("2026-09-18T19:59:59-04:00").getTime();
  assert.equal(Room.sessionStatus(s, before), "upcoming");
});

test("status: live at start boundary", () => {
  const s = sessionsDoc.sessions[0];
  const at = new Date("2026-09-18T20:00:00-04:00").getTime();
  assert.equal(Room.sessionStatus(s, at), "live");
});

test("status: live mid-session (45 min in)", () => {
  const s = sessionsDoc.sessions[0];
  const mid = new Date("2026-09-18T20:45:00-04:00").getTime();
  assert.equal(Room.sessionStatus(s, mid), "live");
});

test("status: past after 90-minute window", () => {
  const s = sessionsDoc.sessions[0];
  const after = new Date("2026-09-18T21:30:01-04:00").getTime();
  assert.equal(Room.sessionStatus(s, after), "past");
});

test("status: timezone edge — 19:59 ET is not 20:00 UTC-day confusion", () => {
  const s = sessionsDoc.sessions[0];
  // 2026-09-19T00:30:00Z == 2026-09-18T20:30:00-04:00 -> live, not past
  const utc = Date.parse("2026-09-19T00:30:00Z");
  assert.equal(Room.sessionStatus(s, utc), "live");
});

test("status: invalid starts_at degrades to past, never throws", () => {
  assert.equal(Room.sessionStatus({ starts_at: "not-a-date" }, Date.now()), "past");
});

test("sessionEndISO is exactly 90 minutes after start", () => {
  const s = sessionsDoc.sessions[0];
  const end = new Date(Room.sessionEndISO(s)).getTime();
  const start = new Date(s.starts_at).getTime();
  assert.equal(end - start, 90 * 60 * 1000);
});

// ---------- ICS generation ----------
test("buildICS: required RFC fields present", () => {
  const s = sessionsDoc.sessions[0];
  const ics = Room.buildICS(s, "https://example.com/");
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("UID:victory-lap-2026-09-18@cwi-listening-room"));
  assert.ok(ics.includes("DTSTART;TZID=America/New_York:20260918T200000"));
  assert.ok(ics.includes("DURATION:PT90M"));
  assert.ok(ics.includes("SUMMARY:CWI Listening Room: New Rap Hits Victory Lap"));
  assert.ok(ics.includes("END:VEVENT"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VTIMEZONE"));
});

test("buildICS: setlist appears in description, escaped", () => {
  const s = sessionsDoc.sessions[0];
  const ics = Room.buildICS(s, "https://example.com/");
  assert.ok(ics.includes("That Boy Hi Hat - Shaka Zulu"));
});

test("buildICS: invalid date returns null (no fake calendar file)", () => {
  assert.equal(Room.buildICS({ id: "x", starts_at: "bogus", theme: "t", description: "d", setlist: [] }), null);
});

test("icsLocal: converts offset ISO to local stamp", () => {
  assert.equal(Room.icsLocal("2026-10-09T20:00:00-04:00"), "20261009T200000");
  assert.equal(Room.icsLocal("bogus"), null);
});

// ---------- RSVP store (device-local honesty) ----------
function memStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
  };
}

test("RSVP: set + has round-trip on a memory store", () => {
  const st = memStore();
  assert.equal(Room.hasRSVP("s1", st), false);
  assert.equal(Room.setRSVP("s1", true, st), true);
  assert.equal(Room.hasRSVP("s1", st), true);
  assert.equal(Room.setRSVP("s1", false, st), true);
  assert.equal(Room.hasRSVP("s1", st), false);
});

test("RSVP: per-session isolation", () => {
  const st = memStore();
  Room.setRSVP("s1", true, st);
  assert.equal(Room.hasRSVP("s2", st), false);
});

test("RSVP: corrupt JSON degrades to empty, never throws", () => {
  const st = memStore();
  st.setItem("cwi-listening-room.rsvps.v1", "{broken");
  assert.deepEqual(Room.readRSVPs(st), {});
});

// ---------- deep links ----------
test("sessionFromQuery: parses ?session=<id>", () => {
  assert.equal(Room.sessionFromQuery("?session=victory-lap-2026-09-18"), "victory-lap-2026-09-18");
  assert.equal(Room.sessionFromQuery("?a=1&session=dre50-global-vibes-2026-10-09"), "dre50-global-vibes-2026-10-09");
  assert.equal(Room.sessionFromQuery(""), null);
  assert.equal(Room.sessionFromQuery("?foo=bar"), null);
});

test("findSession: resolves all 4 seeded ids", () => {
  for (const s of sessionsDoc.sessions) {
    assert.equal(Room.findSession(sessionsDoc.sessions, s.id).theme, s.theme);
  }
  assert.equal(Room.findSession(sessionsDoc.sessions, "nope"), null);
});

// ---------- setlist integrity vs catalog ----------
function catalogIndex() {
  const idx = new Map(); // title|artist -> spotify id or null
  for (const a of catalog.artists) {
    const artist = (a.artist || {}).name;
    for (const t of a.tracks || []) {
      const url = t.spotify_url || "";
      const m = /track\/([A-Za-z0-9]+)/.exec(url);
      idx.set(t.title + "|" + artist, m ? m[1] : null);
    }
  }
  return idx;
}

test("setlists: every entry exists in catalog.json with exact title+artist", () => {
  const idx = catalogIndex();
  for (const s of sessionsDoc.sessions) {
    for (const e of s.setlist) {
      assert.ok(idx.has(e.title + "|" + e.artist),
        `not in catalog: ${e.title} / ${e.artist}`);
    }
  }
});

test("setlists: spotify ids match catalog exactly; null only where catalog has none", () => {
  const idx = catalogIndex();
  for (const s of sessionsDoc.sessions) {
    for (const e of s.setlist) {
      assert.equal(e.spotify_track_id, idx.get(e.title + "|" + e.artist),
        `id mismatch: ${e.title}`);
    }
  }
});

test("setlists: exactly 4 sessions, Fridays 8PM ET, 7 days apart", () => {
  const ss = sessionsDoc.sessions;
  assert.equal(ss.length, 4);
  const days = ["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09"];
  ss.forEach((s, i) => {
    assert.ok(s.starts_at.startsWith(days[i] + "T20:00:00-04:00"), s.starts_at);
    const d = new Date(s.starts_at);
    assert.equal(d.toLocaleString("en-US", { weekday: "long", timeZone: "America/New_York" }), "Friday");
  });
});

test("setlists: no duplicate track within a session", () => {
  for (const s of sessionsDoc.sessions) {
    const seen = new Set();
    for (const e of s.setlist) {
      const k = e.title + "|" + e.artist;
      assert.ok(!seen.has(k), `duplicate in ${s.id}: ${k}`);
      seen.add(k);
    }
  }
});

// ---------- schema validation (structural) ----------
test("sessions.json matches cwi.listening-session/1.0 shape", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(BUILD, "schema/sessions.schema.json"), "utf8"));
  assert.equal(schema.title, "cwi.listening-session/1.0");
  assert.ok(Array.isArray(sessionsDoc.sessions));
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  for (const s of sessionsDoc.sessions) {
    for (const f of ["id", "theme", "starts_at", "timezone", "host", "description", "setlist"]) {
      assert.ok(s[f] !== undefined && s[f] !== null && s[f] !== "", `missing ${f} in ${s.id}`);
    }
    assert.ok(isoRe.test(s.starts_at), `bad ISO in ${s.id}`);
    assert.equal(s.timezone, "America/New_York");
    assert.ok(/^[a-z0-9-]+$/.test(s.id));
    assert.ok(s.setlist.length >= 1);
  }
});

// ---------- embed URL builder ----------
test("embedUrl/spotifyUrl: well-formed, id-injected", () => {
  assert.equal(Room.embedUrl("abc123"), "https://open.spotify.com/embed/track/abc123?utm_source=generator&theme=0");
  assert.equal(Room.spotifyUrl("abc123"), "https://open.spotify.com/track/abc123");
});

// ---------- i18n key coverage ----------
test("i18n: all 6 languages cover every data-i18n key in index.html", () => {
  const html = fs.readFileSync(path.join(BUILD, "index.html"), "utf8");
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 0);
  for (const lang of ["en", "es", "pt-BR", "fr", "de", "ja"]) {
    const t = JSON.parse(fs.readFileSync(path.join(BUILD, "i18n-tables", lang + ".json"), "utf8"));
    for (const k of keys) {
      assert.ok(t[k] && t[k].trim().length > 0, `missing key ${k} in ${lang}`);
    }
  }
});

test("i18n: no empty translations", () => {
  for (const lang of ["en", "es", "pt-BR", "fr", "de", "ja"]) {
    const t = JSON.parse(fs.readFileSync(path.join(BUILD, "i18n-tables", lang + ".json"), "utf8"));
    for (const [k, v] of Object.entries(t)) {
      assert.ok(v.trim().length > 0, `empty ${k} in ${lang}`);
    }
  }
});
