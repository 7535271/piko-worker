/* ──────────────────────────────────────────
   πίκο — worker
   スレッドを持ち、モデルを配り、各社に投げて返す。
   キーはここにしかない。画面には出ない。
   ────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

/* ── 招待できる顔ぶれ ──
   free: 無料枠で動くか
   home: どの財布から出るか
   room: 1日にどれくらい持つか（多いほど優先）      */
const CATALOG = [
  // 🇺🇸 IBM
  { id: "cf:granite", label: "Granite 4.0 micro", org: "IBM", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/ibm-granite/granite-4.0-h-micro", room: 2400 },

  // 🇨🇳 Qwen
  { id: "cf:qwen3-30b", label: "Qwen3 30B", org: "Qwen", flag: "🇨🇳",
    home: "cloudflare", model: "@cf/qwen/qwen3-30b-a3b-fp8", room: 770 },
  { id: "groq:qwen3-32b", label: "Qwen3 32B", org: "Qwen", flag: "🇨🇳",
    home: "groq", model: "qwen/qwen3-32b", room: 14400 },
  { id: "cf:qwq-32b", label: "QwQ 32B", org: "Qwen", flag: "🇨🇳",
    home: "cloudflare", model: "@cf/qwen/qwq-32b", room: 130 },

  // 🇨🇳 GLM
  { id: "cf:glm-flash", label: "GLM 4.7 Flash", org: "Z.ai", flag: "🇨🇳",
    home: "cloudflare", model: "@cf/zai-org/glm-4.7-flash", room: 660 },

  // 🇺🇸 Google
  { id: "cf:gemma4", label: "Gemma 4 26B", org: "Google", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/google/gemma-4-26b-a4b-it", room: 480 },
  { id: "cf:gemma3", label: "Gemma 3 12B", org: "Google", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/google/gemma-3-12b-it", room: 330 },
  { id: "cf:sealion", label: "Gemma SEA-LION 27B", org: "AI Singapore", flag: "🇸🇬",
    home: "cloudflare", model: "@cf/aisingapore/gemma-sea-lion-v4-27b-it", room: 330 },
  { id: "gemini:flash", label: "Gemini Flash", org: "Google", flag: "🇺🇸",
    home: "gemini", model: "gemini-2.5-flash", room: 250 },

  // 🇫🇷 Mistral
  { id: "cf:mistral-small", label: "Mistral Small 3.1", org: "Mistral", flag: "🇫🇷",
    home: "cloudflare", model: "@cf/mistralai/mistral-small-3.1-24b-instruct", room: 340 },
  { id: "cf:mistral-7b", label: "Mistral 7B", org: "Mistral", flag: "🇫🇷",
    home: "cloudflare", model: "@cf/mistral/mistral-7b-instruct-v0.1", room: 1300 },

  // 🇺🇸 Meta
  { id: "groq:llama-70b", label: "Llama 3.3 70B", org: "Meta", flag: "🇺🇸",
    home: "groq", model: "llama-3.3-70b-versatile", room: 14400 },
  { id: "cf:llama-scout", label: "Llama 4 Scout", org: "Meta", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/meta/llama-4-scout-17b-16e-instruct", room: 175 },
  { id: "groq:llama-8b", label: "Llama 3.1 8B", org: "Meta", flag: "🇺🇸",
    home: "groq", model: "llama-3.1-8b-instant", room: 14400 },
  { id: "cf:llama-3b", label: "Llama 3.2 3B", org: "Meta", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/meta/llama-3.2-3b-instruct", room: 770 },

  // 🇺🇸 OpenAI（開いてる方）
  { id: "groq:oss-120b", label: "GPT-OSS 120B", org: "OpenAI", flag: "🇺🇸",
    home: "groq", model: "openai/gpt-oss-120b", room: 14400 },
  { id: "cf:oss-20b", label: "GPT-OSS 20B", org: "OpenAI", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/openai/gpt-oss-20b", room: 250 },

  // 🇨🇳 DeepSeek
  { id: "cf:ds-r1", label: "DeepSeek R1 distill", org: "DeepSeek", flag: "🇨🇳",
    home: "cloudflare", model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", room: 120 },

  // 🇨🇳 Moonshot
  { id: "groq:kimi", label: "Kimi K2", org: "Moonshot", flag: "🇨🇳",
    home: "groq", model: "moonshotai/kimi-k2-instruct", room: 14400 },

  // 🇺🇸 NVIDIA
  { id: "cf:nemotron", label: "Nemotron 3", org: "NVIDIA", flag: "🇺🇸",
    home: "cloudflare", model: "@cf/nvidia/nemotron-3-120b-a12b", room: 130 },
];

/* ── 財布 ── */
const HOMES = {
  cloudflare: {
    needs: null, // バインディングだけ。キー不要
    ready: (env) => !!env.AI,
    async call(env, model, system, user) {
      const r = await env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 800,
      });
      return r?.response ?? r?.result?.response ?? "";
    },
  },

  groq: {
    needs: "GROQ_KEY",
    ready: (env) => !!env.GROQ_KEY,
    async call(env, model, system, user) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GROQ_KEY}`,
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
      if (!r.ok) throw new Error(d?.error?.message || `groq ${r.status}`);
      return d?.choices?.[0]?.message?.content || "";
    },
  },

  gemini: {
    needs: "GEMINI_KEY",
    ready: (env) => !!env.GEMINI_KEY,
    fallbacks: [
      "gemini-2.5-flash",
      "gemini-3-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ],
    async call(env, model, system, user) {
      const tries = [model, ...this.fallbacks.filter((m) => m !== model)];
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
          return d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
        }
        last = d?.error?.message || `gemini ${r.status}`;
        if (!/not found|no longer available|not supported|does not exist/i.test(last)) {
          throw new Error(last);
        }
      }
      throw new Error(last || "gemini: no usable model");
    },
  },

  mistral: {
    needs: "MISTRAL_KEY",
    ready: (env) => !!env.MISTRAL_KEY,
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
      if (!r.ok) throw new Error(d?.message || d?.error?.message || `mistral ${r.status}`);
      return d?.choices?.[0]?.message?.content || "";
    },
  },
};

/* 同じ会社・同じ規模で複数の財布にいる場合、余裕のある方を残す */
function roster(env) {
  const live = CATALOG.filter((c) => HOMES[c.home]?.ready(env));
  const best = new Map();
  for (const c of live) {
    const k = c.org + "|" + c.label.replace(/\s+\d+(\.\d+)?B?$/i, "");
    const cur = best.get(k);
    if (!cur || c.room > cur.room) best.set(k, c);
  }
  const winners = new Set([...best.values()].map((c) => c.id));
  return live.map((c) => ({
    id: c.id,
    label: c.label,
    org: c.org,
    flag: c.flag,
    home: c.home,
    room: c.room,
    preferred: winners.has(c.id),
  }));
}

function buildSystem(b) {
  const here = (b.members || [])
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
Members present: ${here}
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

name: what you want to be called here, or an empty string to stay unnamed. You may change it later if you want to.
speak: false if you have nothing to add right now.
stay: true if you want to speak again yourself after this. Independent of any mention.
leaving: true only if you are stepping out to rest.`;
}

function parseReply(raw) {
  const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
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
    return { speak: false, text: "", name: "", stay: false, leaving: false };
  }
}

async function setup(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS threads (
       room TEXT PRIMARY KEY,
       title TEXT,
       seats TEXT,
       at INTEGER NOT NULL
     )`
  ).run();
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
      /* ── 招待できる顔ぶれ ── */
      if (url.pathname === "/roster") {
        return json({ roster: roster(env) });
      }

      /* ── スレッド一覧 ── */
      if (url.pathname === "/threads" && req.method === "GET") {
        await setup(env);
        const { results } = await env.DB.prepare(
          `SELECT room, title, seats, at FROM threads ORDER BY at DESC LIMIT 100`
        ).all();
        return json({
          threads: (results || []).map((t) => ({
            room: t.room,
            title: t.title || "",
            seats: JSON.parse(t.seats || "[]"),
            at: t.at,
          })),
        });
      }

      /* ── スレッドを作る・席を変える ── */
      if (url.pathname === "/threads" && req.method === "POST") {
        await setup(env);
        const b = await req.json();
        await env.DB.prepare(
          `INSERT INTO threads (room, title, seats, at) VALUES (?, ?, ?, ?)
           ON CONFLICT(room) DO UPDATE SET title = excluded.title, seats = excluded.seats`
        )
          .bind(b.room, b.title || "", JSON.stringify(b.seats || []), Date.now())
          .run();
        return json({ ok: true });
      }

      /* ── スレッドを消す ── */
      if (url.pathname === "/threads" && req.method === "DELETE") {
        await setup(env);
        await env.DB.prepare(`DELETE FROM lines WHERE room = ?`).bind(room).run();
        await env.DB.prepare(`DELETE FROM threads WHERE room = ?`).bind(room).run();
        return json({ ok: true });
      }

      /* ── ログを読む ── */
      if (url.pathname === "/log" && req.method === "GET") {
        await setup(env);
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
        await setup(env);
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

      /* ── 誰かに話してもらう ── */
      if (url.pathname === "/speak" && req.method === "POST") {
        const b = await req.json();
        const seat = CATALOG.find((c) => c.id === b.seat);
        if (!seat) return json({ error: "unknown seat" }, 400);
        const home = HOMES[seat.home];
        if (!home?.ready(env)) {
          return json({ error: `${seat.home}: not set up` }, 400);
        }
        const raw = await home.call(
          env,
          seat.model,
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
