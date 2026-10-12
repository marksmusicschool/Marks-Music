import postgres from "npm:postgres@3.4.4";
import ICAL from "npm:ical.js@2.1.0";
import { eventsBetween } from "./calendar.js";

// Custom auth: every request carries the app password, checked against a bcrypt hash in mm.settings.
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3 });
const TYPES = ["Personal", "Offline", "Swaralaya"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function passwordOk(pw: unknown) {
  if (typeof pw !== "string" || !pw) return false;
  const [r] = await sql`select mm.check_password(${pw}::text) as ok`;
  return r.ok === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return reply({ error: "bad_json" }, 400); }

  try {
    if (!(await passwordOk(body.pw))) {
      await new Promise((r) => setTimeout(r, 600));
      return reply({ error: "wrong_password" }, 401);
    }
    const pw = body.pw as string;

    switch (body.action) {
      case "login":
        return reply({ ok: true });

      case "bootstrap": {
        const [r] = await sql`select mm.bootstrap(${pw}::text) as r`;
        const cals = await sql`select substr(key, 5) as type from mm.settings where key like 'cal:%' order by 1`;
        return reply({ ...r.r, calendars: cals.map((c) => c.type) });
      }

      case "bests": {
        const id = Number(body.student_id);
        if (!Number.isInteger(id)) return reply({ error: "bad_student" }, 400);
        const [r] = await sql`select mm.student_bests(${pw}::text, ${id}::int) as r`;
        return reply(r.r);
      }

      case "students": {
        const [r] = await sql`select mm.students_summary(${pw}::text) as r`;
        return reply({ students: r.r });
      }

      case "student_history": {
        const id = Number(body.student_id);
        if (!Number.isInteger(id)) return reply({ error: "bad_student" }, 400);
        const [r] = await sql`select mm.student_history(${pw}::text, ${id}::int) as r`;
        return reply({ logs: r.r });
      }

      case "history": {
        const sid = body.student_id == null ? null : Number(body.student_id);
        if (sid !== null && !Number.isInteger(sid)) return reply({ error: "bad_student" }, 400);
        const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);
        const offset = Math.max(Number(body.offset) || 0, 0);
        const [r] = await sql`select mm.log_history(${pw}::text, ${sid}::int, ${limit}::int, ${offset}::int) as r`;
        return reply(r.r);
      }

      case "day_logs": {
        const id = Number(body.student_id);
        if (!Number.isInteger(id)) return reply({ error: "bad_student" }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return reply({ error: "bad_date" }, 400);
        const rows = await sql`select id, item_id, score from public.student_logs
                               where student_id = ${id} and created_at::date = ${body.date}::date order by id`;
        return reply({ logs: rows.map((r) => ({ id: Number(r.id), item_id: Number(r.item_id), score: Number(r.score) })) });
      }

      case "delete_log": {
        const id = Number(body.log_id);
        if (!Number.isInteger(id)) return reply({ error: "bad_log" }, 400);
        const rows = await sql`delete from public.student_logs where id = ${id} returning id`;
        return reply({ deleted: rows.length });
      }

      case "log": {
        const sid = body.student_id == null ? null : Number(body.student_id);
        if (sid !== null && !Number.isInteger(sid)) return reply({ error: "bad_student" }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return reply({ error: "bad_date" }, 400);
        const entries = (Array.isArray(body.entries) ? body.entries : [])
          .map((e: any) => ({ item_id: Number(e.item_id), score: Number(e.score) }))
          .filter((e: any) => Number.isInteger(e.item_id) && Number.isFinite(e.score) && e.score > 0);
        if (!entries.length) return reply({ error: "no_entries" }, 400);
        const [r] = await sql`select mm.log_class(${pw}::text, ${sid}::int, ${String(body.student_name ?? "")}::text, ${body.date}::date, ${sql.json(entries)}::jsonb) as r`;
        return reply(r.r);
      }

      case "set_calendar": {
        const type = String(body.type ?? "");
        if (!TYPES.includes(type)) return reply({ error: "bad_type" }, 400);
        const url = String(body.url ?? "").trim().replace(/^webcal:\/\//i, "https://");
        if (url === "") {
          await sql`delete from mm.settings where key = ${"cal:" + type}`;
          return reply({ ok: true, cleared: true });
        }
        if (!/^https:\/\/\S+$/i.test(url)) return reply({ error: "bad_url" }, 400);
        const res = await fetch(url).catch(() => null);
        const text = res && res.ok ? await res.text() : "";
        if (!text.includes("BEGIN:VCALENDAR")) return reply({ error: "not_a_calendar" }, 400);
        await sql`insert into mm.settings (key, value) values (${"cal:" + type}, ${url})
                  on conflict (key) do update set value = excluded.value`;
        return reply({ ok: true });
      }

      case "today": {
        const start = new Date(String(body.start)), end = new Date(String(body.end));
        if (isNaN(+start) || isNaN(+end) || end <= start) return reply({ error: "bad_range" }, 400);
        const cals = await sql`select substr(key, 5) as type, value from mm.settings where key like 'cal:%'`;
        const failed: string[] = [];
        const lists = await Promise.all(cals.map(async (c) => {
          try {
            const res = await fetch(c.value);
            if (!res.ok) throw new Error(String(res.status));
            return eventsBetween(ICAL, await res.text(), start, end).map((e) => ({ ...e, type: c.type }));
          } catch (_) { failed.push(c.type); return []; }
        }));
        const events = lists.flat().sort((a, b) => a.start.localeCompare(b.start));
        return reply({ calendars: cals.map((c) => c.type), failed, events });
      }

      default:
        return reply({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return reply({ error: "server_error" }, 500);
  }
});
