import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3 });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function configuredKey(jsonEnv: string, legacyEnv: string): string | null {
  const raw = Deno.env.get(jsonEnv);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.default === "string" && parsed.default) return parsed.default;
        const value = Object.values(parsed).find((entry) => typeof entry === "string" && entry.length > 0);
        if (typeof value === "string") return value;
      }
    } catch {
      return raw;
    }
  }
  return Deno.env.get(legacyEnv) ?? null;
}

const PUBLISHABLE_KEY = configuredKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET_KEY = configuredKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

async function passwordOk(pw: unknown) {
  if (typeof pw !== "string" || !pw) return false;
  const [r] = await sql`select mm.check_password(${pw}::text) as ok`;
  return r.ok === true;
}

async function authRequest(path: string, key: string, body: unknown, options: { token?: string; method?: string } = {}) {
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const method = options.method ?? "POST";
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data: Record<string, any> = {};
  try { data = JSON.parse(text); } catch { /* keep an empty response body */ }
  return { response, data };
}

function studentEmail(id: number) {
  // Supabase Auth needs an email identity. This reserved, non-routable address is internal only;
  // students sign in with their real student name, and no email is sent to this address.
  return `student-${id}@login.marks-music.invalid`;
}

async function findStudentSession(req: Request) {
  if (!PUBLISHABLE_KEY) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { response, data } = await authRequest("user", PUBLISHABLE_KEY, {}, { token, method: "GET" });
  if (!response.ok || typeof data.id !== "string") return null;
  const [account] = await sql`
    select a.student_id, a.must_change_password, trim(s.name) as name
    from private.student_portal_accounts a
    join public.students s on s.id = a.student_id
    where a.auth_user_id = ${data.id}::uuid
  `;
  if (!account) return null;
  return { token, authUserId: data.id, studentId: Number(account.student_id), name: account.name, mustChangePassword: account.must_change_password === true };
}

async function studentLogin(body: Record<string, any>) {
  if (!PUBLISHABLE_KEY) return reply({ error: "auth_not_configured" }, 503);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || username.length > 120 || !password || password.length > 256) return reply({ error: "wrong_credentials" }, 401);
  const matches = await sql`
    select s.id, trim(s.name) as name, a.auth_user_id, a.must_change_password
    from public.students s
    join private.student_portal_accounts a on a.student_id = s.id
    where lower(btrim(s.name)) = lower(${username})
    limit 2
  `;
  if (matches.length !== 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return reply({ error: "wrong_credentials" }, 401);
  }
  const student = matches[0];
  const { response, data } = await authRequest("token?grant_type=password", PUBLISHABLE_KEY, {
    email: studentEmail(Number(student.id)),
    password,
  });
  if (!response.ok || typeof data.access_token !== "string" || data.user?.id !== student.auth_user_id) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return reply({ error: "wrong_credentials" }, 401);
  }
  return reply({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    student: { id: Number(student.id), name: student.name, must_change_password: student.must_change_password === true },
  });
}

async function refreshStudent(body: Record<string, any>) {
  if (!PUBLISHABLE_KEY || typeof body.refresh_token !== "string" || !body.refresh_token) {
    return reply({ error: "session_expired" }, 401);
  }
  const { response, data } = await authRequest("token?grant_type=refresh_token", PUBLISHABLE_KEY, { refresh_token: body.refresh_token });
  if (!response.ok || typeof data.access_token !== "string" || typeof data.user?.id !== "string") {
    return reply({ error: "session_expired" }, 401);
  }
  const [account] = await sql`
    select a.student_id, a.must_change_password, trim(s.name) as name
    from private.student_portal_accounts a
    join public.students s on s.id = a.student_id
    where a.auth_user_id = ${data.user.id}::uuid
  `;
  if (!account) return reply({ error: "student_account_not_found" }, 403);
  return reply({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    student: { id: Number(account.student_id), name: account.name, must_change_password: account.must_change_password === true },
  });
}

function newStudentPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const chars = [...bytes].map((value) => alphabet[value % alphabet.length]);
  return `${chars.slice(0, 6).join("")}-${chars.slice(6, 12).join("")}-${chars.slice(12).join("")}`;
}

async function listStudentAccounts() {
  const rows = await sql`
    select s.id, trim(s.name) as name,
           a.auth_user_id is not null as has_login,
           coalesce(a.must_change_password, false) as must_change_password
    from public.students s
    left join private.student_portal_accounts a on a.student_id = s.id
    order by lower(trim(s.name)), s.id
  `;
  return reply({ students: rows.map((row) => ({
    id: Number(row.id), name: row.name, has_login: row.has_login === true,
    must_change_password: row.must_change_password === true,
  })) });
}

async function resetStudentAccount(body: Record<string, any>) {
  if (!SECRET_KEY) return reply({ error: "account_admin_not_configured" }, 503);
  const studentId = Number(body.student_id);
  if (!Number.isInteger(studentId)) return reply({ error: "bad_student" }, 400);
  const [student] = await sql`select id, trim(name) as name from public.students where id = ${studentId}::smallint`;
  if (!student) return reply({ error: "student_not_found" }, 404);
  const [existing] = await sql`select auth_user_id from private.student_portal_accounts where student_id = ${studentId}::smallint`;
  const password = newStudentPassword();
  let authUserId: string;
  if (existing?.auth_user_id) {
    const adminAuth = SECRET_KEY.startsWith("eyJ") ? { token: SECRET_KEY } : {};
    const { response, data } = await authRequest(`admin/users/${existing.auth_user_id}`, SECRET_KEY, { password }, { ...adminAuth, method: "PUT" });
    if (!response.ok || typeof data.id !== "string") return reply({ error: "account_reset_failed" }, 502);
    authUserId = data.id;
  } else {
    const adminAuth = SECRET_KEY.startsWith("eyJ") ? { token: SECRET_KEY } : {};
    const { response, data } = await authRequest("admin/users", SECRET_KEY, {
      email: studentEmail(studentId), password, email_confirm: true,
    }, adminAuth);
    if (!response.ok || typeof data.id !== "string") return reply({ error: "account_create_failed" }, 502);
    authUserId = data.id;
  }
  await sql`
    insert into private.student_portal_accounts (student_id, auth_user_id, must_change_password)
    values (${studentId}::smallint, ${authUserId}::uuid, true)
    on conflict (student_id) do update
    set auth_user_id = excluded.auth_user_id, must_change_password = true
  `;
  return reply({ username: student.name, temporary_password: password, must_change_password: true });
}

async function handleStudentAction(action: string, body: Record<string, any>, session: NonNullable<Awaited<ReturnType<typeof findStudentSession>>>) {
  if (action === "student_logout") {
    if (PUBLISHABLE_KEY) await authRequest("logout", PUBLISHABLE_KEY, {}, { token: session.token }).catch(() => null);
    return reply({ ok: true });
  }

  if (action === "student_change_password") {
    if (!PUBLISHABLE_KEY) return reply({ error: "auth_not_configured" }, 503);
    const password = typeof body.new_password === "string" ? body.new_password : "";
    if (password.length < 12) return reply({ error: "password_too_short" }, 400);
    if (password.length > 128) return reply({ error: "password_too_long" }, 400);
    const { response } = await authRequest("user", PUBLISHABLE_KEY, { password }, { token: session.token, method: "PUT" });
    if (!response.ok) return reply({ error: "password_change_failed" }, 400);
    await sql`update private.student_portal_accounts set must_change_password = false where auth_user_id = ${session.authUserId}::uuid`;
    return reply({ ok: true });
  }

  if (session.mustChangePassword) return reply({ error: "password_change_required" }, 403);

  if (action === "student_bootstrap") {
    const [student] = await sql`select id, trim(name) as name from public.students where id = ${session.studentId}::smallint`;
    const items = await sql`
      select i.id, i.name, sc.name as sub, c.name as cat, i.exc_order as "order"
      from public.items i
      left join public.subcategories sc on sc.id = i.subcategory_id
      left join public.categories c on c.id = i.category_id
      order by i.exc_order
    `;
    return reply({ student: { id: Number(student.id), name: student.name }, items });
  }

  if (action === "student_history") {
    const rows = await sql`
      select l.id, l.student_id, l.item_id, l.score, mm.ist_date(l.created_at) as date
      from public.student_logs l
      where l.student_id = ${session.studentId}::smallint
      order by l.created_at, l.id
    `;
    return reply({ logs: rows.map((row) => ({
      id: Number(row.id), student_id: Number(row.student_id), item_id: Number(row.item_id),
      score: Number(row.score), date: row.date,
    })) });
  }

  return reply({ error: "unknown_action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return reply({ error: "bad_json" }, 400); }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "student_login") return await studentLogin(body);
    if (action === "student_refresh") return await refreshStudent(body);

    if (action === "admin_student_accounts" || action === "admin_reset_student_password") {
      if (!(await passwordOk(body.pw))) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return reply({ error: "wrong_password" }, 401);
      }
      if (action === "admin_student_accounts") return await listStudentAccounts();
      return await resetStudentAccount(body);
    }

    if (!action.startsWith("student_")) return reply({ error: "unknown_action" }, 400);
    const session = await findStudentSession(req);
    if (!session) return reply({ error: "unauthorized" }, 401);
    return await handleStudentAction(action, body, session);
  } catch (error) {
    console.error(error);
    return reply({ error: "server_error" }, 500);
  }
});
