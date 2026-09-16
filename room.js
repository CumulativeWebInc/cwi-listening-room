/* CWI Listening Room engine — zero-dependency UMD.
 * Real clocks only: session status is computed from Date.now() against
 * starts_at. No simulated attendance, no fake "now playing". */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CWIRoom = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SESSION_MINUTES = 90;

  function parseISO(s) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // status: "upcoming" | "live" | "past"
  function sessionStatus(session, nowMs) {
    var start = parseISO(session.starts_at);
    if (!start) return "past";
    var now = typeof nowMs === "number" ? nowMs : Date.now();
    var end = start.getTime() + SESSION_MINUTES * 60 * 1000;
    if (now < start.getTime()) return "upcoming";
    if (now <= end) return "live";
    return "past";
  }

  function sessionEndISO(session) {
    var start = parseISO(session.starts_at);
    if (!start) return null;
    return new Date(start.getTime() + SESSION_MINUTES * 60 * 1000).toISOString();
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // "2026-09-18T20:00:00-04:00" -> "20260918T200000"
  function icsLocal(dt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dt);
    if (!m) return null;
    return m[1] + m[2] + m[3] + "T" + m[4] + m[5] + m[6];
  }

  function escapeICS(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  // Minimal VTIMEZONE for America/New_York (EDT/EST, US rules, 2007+).
  var VTIMEZONE =
    "BEGIN:VTIMEZONE\r\n" +
    "TZID:America/New_York\r\n" +
    "BEGIN:DAYLIGHT\r\n" +
    "TZOFFSETFROM:-0500\r\n" +
    "TZOFFSETTO:-0400\r\n" +
    "TZNAME:EDT\r\n" +
    "DTSTART:19700308T020000\r\n" +
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n" +
    "END:DAYLIGHT\r\n" +
    "BEGIN:STANDARD\r\n" +
    "TZOFFSETFROM:-0400\r\n" +
    "TZOFFSETTO:-0500\r\n" +
    "TZNAME:EST\r\n" +
    "DTSTART:19701101T020000\r\n" +
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n" +
    "END:STANDARD\r\n" +
    "END:VTIMEZONE";

  function buildICS(session, pageUrl) {
    var dt = icsLocal(session.starts_at);
    if (!dt) return null;
    var start = parseISO(session.starts_at);
    var end = new Date(start.getTime() + SESSION_MINUTES * 60 * 1000);
    var dtEnd = end.getFullYear() + pad(end.getMonth() + 1) + pad(end.getDate()) +
      "T" + pad(end.getHours()) + pad(end.getMinutes()) + pad(end.getSeconds());
    // NOTE: end is rendered in the visitor's local zone; start uses the
    // session's America/New_York zone. Both are labeled in the UI.
    var uid = session.id + "@cwi-listening-room";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cumulative Web Inc//CWI Listening Room//EN",
      "CALSCALE:GREGORIAN",
      VTIMEZONE,
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
      "DTSTART;TZID=America/New_York:" + dt,
      "DURATION:PT90M",
      "SUMMARY:" + escapeICS("CWI Listening Room: " + session.theme),
      "DESCRIPTION:" + escapeICS(session.description + " Setlist: " +
        session.setlist.map(function (t) { return t.artist + " - " + t.title; }).join("; ")),
      "URL:" + escapeICS(pageUrl || "https://cumulativewebinc.github.io/cwi-listening-room/"),
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n") + "\r\n";
  }

  // --- Device-local RSVP store (explicitly NOT a global count) ---
  var RSVP_KEY = "cwi-listening-room.rsvps.v1";

  function readRSVPs(storage) {
    var store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return {};
    try { return JSON.parse(store.getItem(RSVP_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function setRSVP(sessionId, attending, storage) {
    var store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return false;
    var all = readRSVPs(store);
    if (attending) all[sessionId] = new Date().toISOString();
    else delete all[sessionId];
    try { store.setItem(RSVP_KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }

  function hasRSVP(sessionId, storage) {
    return !!readRSVPs(storage)[sessionId];
  }

  // --- Deep links ---
  function sessionFromQuery(search) {
    var q = String(search || "").replace(/^\?/, "");
    var m = /(?:^|&)session=([^&]+)/.exec(q);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function findSession(sessions, id) {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === id) return sessions[i];
    }
    return null;
  }

  function embedUrl(trackId) {
    return "https://open.spotify.com/embed/track/" + trackId + "?utm_source=generator&theme=0";
  }

  function spotifyUrl(trackId) {
    return "https://open.spotify.com/track/" + trackId;
  }

  // Human-readable "Fri, Sep 18 · 8:00 PM ET" from ISO with offset.
  function formatWhen(startsAt, locale) {
    var d = parseISO(startsAt);
    if (!d) return startsAt;
    try {
      return d.toLocaleString(locale || "en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
        timeZone: "America/New_York"
      });
    } catch (e) {
      return startsAt;
    }
  }

  return {
    SESSION_MINUTES: SESSION_MINUTES,
    sessionStatus: sessionStatus,
    sessionEndISO: sessionEndISO,
    buildICS: buildICS,
    icsLocal: icsLocal,
    readRSVPs: readRSVPs,
    setRSVP: setRSVP,
    hasRSVP: hasRSVP,
    sessionFromQuery: sessionFromQuery,
    findSession: findSession,
    embedUrl: embedUrl,
    spotifyUrl: spotifyUrl,
    formatWhen: formatWhen
  };
});
