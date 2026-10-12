// Returns the events that start inside [start, end) from an iCal feed, with weekly repeats expanded.
export function eventsBetween(ICAL, icsText, start, end) {
  const root = new ICAL.Component(ICAL.parse(icsText));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(tz); } catch (_) { /* already known */ }
  }
  const all = root.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
  const masters = new Map(), loose = [];
  for (const e of all) if (!e.isRecurrenceException()) masters.set(e.uid, e);
  for (const e of all) {
    if (!e.isRecurrenceException()) continue;
    const m = masters.get(e.uid);
    if (m) m.relateException(e); else loose.push(e);
  }
  const out = [];
  const push = (item, s, eEnd) => {
    const status = String(item.component.getFirstPropertyValue("status") || "").toUpperCase();
    if (status === "CANCELLED") return;
    if (s >= start && s < end) {
      const text = [item.location, item.description, item.component.getFirstPropertyValue("x-google-conference")].join(" ");
      out.push({ summary: (item.summary || "").trim(), start: s.toISOString(), end: eEnd ? eEnd.toISOString() : null, meet: /meet\.google\.com/i.test(text) });
    }
  };
  for (const e of [...masters.values(), ...loose]) {
    if (e.isRecurring()) {
      const it = e.iterator();
      let t, guard = 0;
      while ((t = it.next()) && guard++ < 20000) {
        if (t.toJSDate() >= end) break;
        const d = e.getOccurrenceDetails(t);
        push(d.item, d.startDate.toJSDate(), d.endDate.toJSDate());
      }
    } else {
      push(e, e.startDate.toJSDate(), e.endDate ? e.endDate.toJSDate() : null);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
