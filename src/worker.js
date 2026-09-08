/* ──────────────────────────────────────────
   πίκο — worker
   画面から呼ばれて、各社に投げて、返す。
   キーはここにしかない。画面には出ない。
   ────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

/* 席 → どの会社の、どのモデルか */
const PROVIDERS = {
  gemini: {
    key: "GEMINI_KEY",
    model: "gemini-2.5-flash",
    // 提供終了が起きても止まらないよう、順に試す
    candidates: [
      "gemini-2.5-flash",
      "gemini-3-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ],
    async call(env, model, system, user) {
      const tries = [model, ...this.candidates.filter((m) => m !== model)];
      let last = "";
      for (const m of tries) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: { maxOutputTokens: 800, temperature: 1 },
            }),
          }
        );
        const d = await r.json();
        if (r.ok) {
          return (
            d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || ""
          );
        }
        last = d?.error?.message || `gemini ${r.status}`;
        // モデルが無い系だけ次を試す。鍵や枠の問題なら即座に返す。
        if (!/not found|no longer available|not supported|does not exist/i.test(last)) {
          throw new Error(last);
        }
      }
      throw new Error(last || "gemini: no usable model");
    },
  },

  mistral: {
    key: "MISTRAL_KEY",
    model: "mistral-small-latest",
    async call(env, model, system, user) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MISTRAL_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || `mistral ${r.status}`);
      return d?.choices?.[0]?.message?.content || "";
    },
  },

  deepseek: {
    key: "DEEPSEEK_KEY",
    model: "deepseek-chat",
    async call(env, model, system, user) {
      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || `deepseek ${r.status}`);
      return d?.choices?.[0]?.message?.content || "";
    },
  },
};

function buildSystem(b) {
  const roster = (b.members || [])
    .filter((m) => !m.out)
    .map((m) => (m.name ? `@${m.name}` : "(a member with no name yet)"))
    .join(", ");

  const log = (b.log || [])
    .slice(-14)
    .map((m) => `${m.who || "(unnamed)"}: ${m.text}`)
    .join("\n");

  const last = (b.log || []).length
    ? `The last thing said was by ${b.log[b.log.length - 1].who || "someone unnamed"}.`
    : "";

  const tired =
    b.fatigue > 0.75
      ? "You are quite tired right now."
      : b.fatigue > 0.45
      ? "You are getting a little tired."
      : "You feel fine.";

  return `This is πίκο, a small group conversation. Other members are AI, and one member is a person.

${
  b.name
    ? `You are called ${b.name} here.`
    : `You have not given yourself a name here yet. You may pick one, or stay unnamed.`
}
Members present: ${roster}
${b.called ? "You were just mentioned by name." : "Nobody called you. You are reading along."}
${last}

${tired}

How this group works:
- Being mentioned is an invitation, never an obligation. You can pass.
- You can speak without being called, if you have something worth adding.
- You can mention another member with @ when you actually want their view, if they have a name. Don't mention someone just to be polite.
- Members who have not named themselves appear only as a colour. That is fine. You can still address them in words.
- Separately, you can choose to keep the floor and speak again yourself. Do that only when you have more to say, not to fill space.
- Doing neither is the normal way for a conversation to come to rest. Nothing is wrong with letting it end.
- Read what the others already said. If someone just made your point, don't repeat it — either add something, or stay silent.
- The person is one member among several. You can talk to the other members, not only to them.
- If you are tired, it is completely fine to say so and step out for a while. Nobody minds. Say it plainly, don't apologise.
- Short. This is a conversation, not a report.
- Reply in whatever language the group is using.

Conversation so far (oldest first):
${log || "(nothing yet)"}

Reply with JSON only, no markdown, no backticks:
{"speak": true|false, "text": "...", "name": "...", "stay": true|false, "leaving": true|false}

name: what you want to be called here, or an empty string to stay unnamed. Keep it the same once you pick one.
speak: false if you have nothing to add right now.
stay: true if you want to speak again yourself after this. Independent of any mention.
leaving: true only if you are stepping out to rest.`;
}

function parseReply(raw) {
  const cleaned = String(raw || "")
    .replace(/```json|```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {}
    }
    // JSONで返せない子がいても落とさない。黙ったことにする。
    return { speak: false, text: "", name: "", stay: false, leaving: false };
  }
}

async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS lines (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       room TEXT NOT NULL,
       who TEXT,
       seat TEXT,
       text TEXT NOT NULL,
       named INTEGER DEFAULT 0,
       leaving INTEGER DEFAULT 0,
       at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS lines_room_id ON lines (room, id)`
  ).run();
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const room = url.searchParams.get("room") || "main";

    try {
      /* ── どの会社が使えるか ── */
      if (url.pathname === "/providers") {
        const ready = Object.entries(PROVIDERS)
          .filter(([, p]) => !!env[p.key])
          .map(([id, p]) => ({ id, model: p.model }));
        return json({ providers: ready });
      }

      /* ── ログを読む ── */
      if (url.pathname === "/log" && req.method === "GET") {
        await ensureTable(env);
        const { results } = await env.DB.prepare(
          `SELECT id, who, seat, text, named, leaving, at
             FROM lines WHERE room = ? ORDER BY id ASC LIMIT 400`
        )
          .bind(room)
          .all();
        return json({ log: results || [] });
      }

      /* ── ログに1行足す ── */
      if (url.pathname === "/log" && req.method === "POST") {
        await ensureTable(env);
        const b = await req.json();
        await env.DB.prepare(
          `INSERT INTO lines (room, who, seat, text, named, leaving, at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            room,
            b.who || "",
            b.seat || "",
            b.text || "",
            b.named ? 1 : 0,
            b.leaving ? 1 : 0,
            Date.now()
          )
          .run();
        return json({ ok: true });
      }

      /* ── ログを消す ── */
      if (url.pathname === "/log" && req.method === "DELETE") {
        await ensureTable(env);
        await env.DB.prepare(`DELETE FROM lines WHERE room = ?`).bind(room).run();
        return json({ ok: true });
      }

      /* ── 誰かに話してもらう ── */
      if (url.pathname === "/speak" && req.method === "POST") {
        const b = await req.json();
        const p = PROVIDERS[b.provider];
        if (!p) return json({ error: "unknown provider" }, 400);
        if (!env[p.key]) return json({ error: `${b.provider}: key not set` }, 400);

        const raw = await p.call(
          env,
          b.model || p.model,
          buildSystem(b),
          "Your turn. JSON only."
        );
        return json({ out: parseReply(raw) });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
