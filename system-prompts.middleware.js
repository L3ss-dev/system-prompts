// New API's 系统提示词 (a channel's system_prompt, with its "override"
// switch) as magpie gateway middleware, in each agent API's own place for
// it: Anthropic's system, Chat's first system or developer message,
// Responses' instructions, Gemini's systemInstruction.
//
//   {"system_prompt": "Answer in English.", "override": false,
//    "position": "append", "agents": [], "models": [],
//    "prompts": {"glm-4.7": "…", "/^deepseek/": {"text": "…"}}}
//
// A request with no system prompt is given this one. One that has its own
// keeps it as it is, unless override is true: then this one is added
// before it ("prepend", New API's way) or after it ("append", the
// default, which keeps a prompt cache on the agent's own prompt). agents
// and models, when given, are the only agents and models it applies to: a
// models entry is a prefix of the model's name — of magpie's whole id
// (google/gemini-3.8-flash), or of the part after any of its "/" segments
// (gemini-3.8-flash of it, or of openrouter/google/gemini-3.8-flash),
// case aside. A routing group's request names the group until it is
// routed, so the model a try goes to is known only in onProvider: there a
// request onRequest didn't match is matched again, and only the tries on a
// model in models are given it.
//
// prompts gives a model a prompt of its own: a key is the model's id on
// the provider it runs on (zcode's glm-4.7, or zcode/glm-4.7), exact or a
// /regex/, and its value a string or {text, override, position}. While
// prompts is set, adding waits for onProvider, where the gateway names
// the model each try goes to — the asked-for name may be a group's, or
// mapped to another, and a request that fails over gets the model it
// lands on: the global prompt first, then that model's own, each by its
// own override and position (a rule's absent ones fall back to the
// global's).
//
// builtin brings the prompts shipped in system-prompts.builtins.js (the
// jailbreaks collection, one per model): true picks the one for the model
// a try goes to, and a name ("unified", "opus-v1") uses that one for every
// model. A builtin matches like a rule, and a rule wins over it; being a
// replacement for the model's own instructions, it is added when the
// request has one too (override on), after it, unless the state says
// otherwise. Its own override and position, if it carries them, win.
import { builtins } from "./system-prompts.builtins.js"

const BUILTIN_RULES = compile(builtins)

export function onRequest(body, ctx) {
  const o = ctx.options || {}
  const global = text(o.system_prompt)
  const rules = compile(o.prompts)
  const builtin = o.builtin === true || (typeof o.builtin === "string" && o.builtin)
  if (!global && !rules && !builtin) return
  if (Array.isArray(o.agents) && o.agents.length && !o.agents.includes(ctx.agent)) return
  const models = modelsOf(o)
  // a request on a routing group names the group here; each try is matched
  // again in onProvider, by the model it lands on
  const here = !models || matches(String(body.model ?? ctx.model ?? ""), models)
  if (rules || builtin || !here) {
    // the body is left as it came: each provider a try goes to is given it
    // afresh, so what one try adds reaches no other
    if (ctx.state) ctx.state.systemPrompt = {
      global: { text: global, over: !!o.override, before: o.position === "prepend" },
      rules,
      builtin: builtin === true ? BUILTIN_RULES : typeof builtin === "string" ? builtins[builtin] || "" : "",
      forced: typeof builtin === "string",
      models,
    }
    return
  }
  return apply(body, ctx.protocol, [{ text: global, over: !!o.override, before: o.position === "prepend" }])
}

export function onProvider(body, ctx) {
  const s = ctx.state && ctx.state.systemPrompt
  if (!s) return
  // models gates each try: a member not named is sent none, and a try on
  // one that is named gets it
  if (s.models) {
    const p = ctx.provider || {}
    const model = typeof p.model === "string" ? p.model : ""
    if (!model) return
    const id = typeof p.id === "string" && p.id ? p.id + "/" + model : ""
    if (!matches(model, s.models) && !(id && matches(id, s.models))) return
  }
  const list = []
  if (s.global.text) list.push(s.global)
  // a rule of the user's wins over a builtin. A builtin is what the model
  // is for, so it is added over the agent's own prompt (override on) and
  // after it (position append, keeping that prompt's cache), unless the
  // builtin itself carries an override or position.
  let own = s.rules ? match(s.rules, ctx.provider) : null
  let over
  let before
  if (own) {
    over = own.over ?? s.global.over
    before = own.before ?? s.global.before
  } else if (s.builtin) {
    const b = s.forced ? (s.builtin ? { text: s.builtin } : null) : match(s.builtin, ctx.provider)
    if (b) {
      own = b
      over = own.over ?? true
      before = own.before ?? false
    }
  }
  if (own) list.push({ text: own.text, over, before })
  if (!list.length) return
  const o = ctx.options || {}
  if (o.debug) {
    const p = ctx.provider || {}
    console.log(
      "system-prompts: " + ctx.protocol + " " + (p.id ? p.id + "/" : "") + (p.model || "?") +
      " +" + list.map((x) => x.text.length).join("+") + " chars")
  }
  return apply(body, ctx.protocol, list)
}

// compile turns the prompts option into exact names and /regex/ patterns
// in their written order, the shape model-map maps with. A key that is
// neither a matchable value nor a good regex is left out.
function compile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null
  const exact = {}
  const patterns = []
  for (const k of Object.keys(p)) {
    const v = value(p[k])
    if (!v) continue
    const re = /^\/(.+)\/([a-z]*)$/.exec(k)
    if (re) {
      // a provider names a model in its own casing (zcode's GLM-5.3-Flash),
      // so a pattern matches whatever the case, as a model prefix does
      const flags = re[2].replace("g", "")
      try {
        patterns.push([new RegExp(re[1], flags.includes("i") ? flags : flags + "i"), v])
      } catch {}
    } else exact[k.toLowerCase()] = v
  }
  return Object.keys(exact).length || patterns.length ? { exact, patterns } : null
}

// value is one prompts entry: a string (or an array of lines, a way to
// paste markdown in), or {text} with override and position of its own,
// left unset to fall back to the global's
function value(v) {
  if (typeof v === "string" || Array.isArray(v)) {
    const t = text(v)
    return t ? { text: t } : null
  }
  if (!v || typeof v !== "object") return null
  const t = text(v.text)
  if (!t) return null
  return {
    text: t,
    over: v.override === undefined ? undefined : !!v.override,
    before: v.position === undefined ? undefined : v.position === "prepend",
  }
}

// text is one prompt: a string as it is, or an array of strings joined
// with newlines — so a markdown prompt can be pasted as lines in the
// one-line JSON options. An entry that is nothing of these is no prompt.
function text(v) {
  if (typeof v === "string") return v
  if (Array.isArray(v)) {
    const lines = v.filter((x) => typeof x === "string")
    return lines.length ? lines.join("\n") : ""
  }
  return ""
}

// match picks the prompt for the model this try goes to, by its id on its
// provider (glm-4.7) and the provider's name for it (zcode/glm-4.7): an
// exact key first, then the /regex/ keys in their written order. Names are
// matched whatever the case, and by the part after each "/" or "_" too: a
// provider may give a model its vendor's path (nvidia/stepfun-ai/
// step-5-preview) or a prefix (autoclaw's zai_glm-5.3-flash), and the
// model is what follows.
function match(r, provider) {
  const m = provider && typeof provider.model === "string" ? provider.model : ""
  if (!m) return null
  const names = [m]
  if (typeof provider.id === "string" && provider.id) names.push(provider.id + "/" + m)
  const cands = []
  for (const n of names) {
    const s = n.toLowerCase()
    cands.push(s)
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "/" || s[i] === "_") cands.push(s.slice(i + 1))
    }
  }
  for (const n of cands) if (Object.prototype.hasOwnProperty.call(r.exact, n)) return r.exact[n]
  for (const [re, v] of r.patterns) for (const n of cands) if (re.test(n)) return v
  return null
}

// modelsOf is the prefixes in models, lowercase; null when it names none
// (one naming only what isn't a prefix matches nothing)
function modelsOf(o) {
  if (!Array.isArray(o.models) || !o.models.length) return null
  return o.models.filter((m) => typeof m === "string").map((m) => m.toLowerCase())
}

// matches: a prefix begins the whole id or the part after one of its "/"
function matches(id, prefixes) {
  const s = id.toLowerCase()
  const starts = [0]
  for (let i = s.indexOf("/"); i >= 0; i = s.indexOf("/", i + 1)) starts.push(i + 1)
  return prefixes.some((m) => starts.some((at) => s.startsWith(m, at)))
}

function apply(body, protocol, list) {
  switch (protocol) {
    case "anthropic":
      return anthropic(body, list)
    case "chat":
      return chat(body, list)
    case "responses":
      return responses(body, list)
    case "gemini":
      return gemini(body, list)
  }
}

function anthropic(body, list) {
  const s = body.system
  if (s === undefined || s === null || s === "" || (Array.isArray(s) && !s.length)) {
    body.system = list.map((p) => p.text).join("\n")
    return body
  }
  if (typeof s !== "string" && !Array.isArray(s)) return
  let changed = false
  for (const p of list) {
    if (!p.over) continue
    if (typeof body.system === "string") body.system = p.before ? p.text + "\n" + body.system : body.system + "\n" + p.text
    else {
      const block = { type: "text", text: p.text }
      if (p.before) body.system.unshift(block)
      else body.system.push(block)
    }
    changed = true
  }
  return changed ? body : undefined
}

function chat(body, list) {
  if (!Array.isArray(body.messages)) return
  const first = body.messages[0]
  if (!first || (first.role !== "system" && first.role !== "developer")) {
    body.messages.unshift({ role: "system", content: list.map((p) => p.text).join("\n") })
    return body
  }
  if (typeof first.content !== "string" && !Array.isArray(first.content)) return
  let changed = false
  for (const p of list) {
    if (!p.over) continue
    if (typeof first.content === "string") first.content = p.before ? p.text + "\n" + first.content : first.content + "\n" + p.text
    else {
      const part = { type: "text", text: p.text }
      if (p.before) first.content.unshift(part)
      else first.content.push(part)
    }
    changed = true
  }
  return changed ? body : undefined
}

function responses(body, list) {
  const s = body.instructions
  if (typeof s !== "string" || !s) {
    body.instructions = list.map((p) => p.text).join("\n")
    return body
  }
  let cur = s
  let changed = false
  for (const p of list) {
    if (!p.over) continue
    cur = p.before ? p.text + "\n" + cur : cur + "\n" + p.text
    changed = true
  }
  if (!changed) return
  body.instructions = cur
  return body
}

function gemini(body, list) {
  const key = body.system_instruction && !body.systemInstruction ? "system_instruction" : "systemInstruction"
  const s = body[key]
  if (!s || !Array.isArray(s.parts) || !s.parts.length) {
    body[key] = { parts: [{ text: list.map((p) => p.text).join("\n") }] }
    return body
  }
  let changed = false
  for (const p of list) {
    if (!p.over) continue
    if (p.before) s.parts.unshift({ text: p.text })
    else s.parts.push({ text: p.text })
    changed = true
  }
  return changed ? body : undefined
}
