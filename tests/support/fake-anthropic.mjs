// A tiny stand-in for the Anthropic Messages API, used only by end-to-end
// tests. Pingly's real SDK client talks to it via ANTHROPIC_BASE_URL, so the
// full request → structured output → validation → confirmation path runs.
//
// It answers a handful of scripted phrases by reading the <people> context the
// app sends, and records every request at GET /__requests so tests can check
// exactly what personal data left the server.
import http from "node:http";

const PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 4010);
const requests = [];

function tag(text, name) {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return m ? m[1] : "";
}

function localDate(timeZone, addDays = 0) {
  const d = new Date(Date.now() + addDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function nextWeekday(timeZone, weekday /* 0=Sun */) {
  for (let i = 1; i <= 7; i++) {
    const date = localDate(timeZone, i);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday) return date;
  }
}

function respond(userText) {
  const message = tag(userText, "message");
  const people = JSON.parse(tag(userText, "people") || "[]");
  const tz = (/\(([^()]+)\)<\/now>/.exec(userText) ?? [])[1] ?? "UTC";
  const find = (name) => people.filter((p) => p.name.toLowerCase().startsWith(name.toLowerCase()));
  const out = { reply: "", actions: [], draft: null, choices: [] };

  let m;
  if ((m = /^I met (\w+) today\. (?:She|He)['’]s an? ([\w ]+?) and loves (\w+)\.?$/i.exec(message))) {
    out.reply = `Nice! I can save ${m[1]} with these details — confirm below.`;
    out.actions.push({
      type: "create_person",
      name: m[1],
      relationship: null,
      birthday: null,
      email: null,
      phone: null,
      memories: [`Works as a ${m[2]}`, `Loves ${m[3]}`],
    });
  } else if ((m = /^Remind me to ask (\w+) about (?:her|his|their) new project next Friday\.?$/i.exec(message))) {
    const [p] = find(m[1]);
    out.reply = `Here's a reminder for next Friday — tap Save to confirm.`;
    out.actions.push({
      type: "create_reminder",
      person_id: p?.id ?? null,
      new_person_name: p ? null : m[1],
      title: `Ask ${m[1]} about the new project`,
      note: null,
      kind: "follow_up",
      date: nextWeekday(tz, 5),
      time: "09:00",
      recurrence: "none",
    });
  } else if ((m = /^Remind me to call (\w+) tomorrow at 6 ?PM\.?$/i.exec(message))) {
    const [p] = find(m[1]);
    out.reply = `I can set that for tomorrow at 6 PM.`;
    out.actions.push({
      type: "create_reminder",
      person_id: p?.id ?? null,
      new_person_name: p ? null : m[1],
      title: `Call ${m[1]}`,
      note: null,
      kind: "custom",
      date: localDate(tz, 1),
      time: "18:00",
      recurrence: "none",
    });
  } else if ((m = /^(\w+) loves (\w+), (?:her|his) birthday is May (\d+)/i.exec(message))) {
    const matches = find(m[1]);
    if (matches.length > 1) {
      out.reply = `Which ${m[1]} do you mean?`;
      out.choices = matches.map((p) => `${p.name}${p.relationship ? ` (${p.relationship})` : ""}`);
    } else if (matches.length === 1) {
      out.reply = `Got it — here's what I can save for ${matches[0].name}.`;
      out.actions.push({ type: "add_memories", person_id: matches[0].id, memories: [`Loves ${m[2]}`] });
      out.actions.push({
        type: "update_person",
        person_id: matches[0].id,
        relationship: null,
        birthday: { month: 5, day: Number(m[3]), year: null },
        email: null,
        phone: null,
      });
    } else {
      out.reply = `You don't have ${m[1]} saved yet. Want me to add them?`;
    }
  } else if ((m = /^What do I remember about (\w+)/i.exec(message))) {
    const [p] = find(m[1]);
    out.reply = p
      ? `${p.name}: ${p.memories.join("; ") || "nothing saved yet"}.`
      : `I don't have anyone named ${m[1]} saved yet.`;
  } else if ((m = /^Write a friendly follow-up to (\w+)/i.exec(message))) {
    const [p] = find(m[1]);
    out.reply = `Here's a draft:`;
    out.draft = { person_id: p?.id ?? null, text: `Hi ${m[1]}! Great catching up — how's the ${p?.memories?.[0]?.toLowerCase() ?? "week"} going?` };
  } else {
    out.reply = "I'm the test model. I only know a few phrases.";
  }
  return out;
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__requests") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(requests));
  }
  if (req.method === "DELETE" && req.url === "/__requests") {
    requests.length = 0;
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404);
    return res.end();
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body);
    requests.push({ headers: { "x-api-key": req.headers["x-api-key"] ? "<set>" : null }, body: parsed });
    const last = parsed.messages[parsed.messages.length - 1];
    const text = typeof last.content === "string" ? last.content : last.content.map((b) => b.text ?? "").join("");
    const output = respond(text);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: `msg_fake_${requests.length}`,
        type: "message",
        role: "assistant",
        model: parsed.model,
        content: [{ type: "text", text: JSON.stringify(output) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    );
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake anthropic listening on ${PORT}`));
