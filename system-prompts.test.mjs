import * as mod from "./system-prompts.middleware.js"
import { builtins } from "./system-prompts.builtins.js"
// the monorepo's runner when this folder sits in packages/, else its copy
const { check, run } = await import("../../scripts/middleware.mjs").catch(() => import("./middleware.harness.mjs"))
import { test, expect } from "bun:test"

check(import.meta.dir, mod)

// builtin: its text is the collection's, too long to restate in cases.json
const c = (options, provider, request = { model: "m", messages: [] }, ctx = {}) => ({ options, provider, request, ctx })

test("builtin: true picks the prompt of the model the try goes to", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "zcode", model: "glm-5.2" }))
  expect(got.request.system).toBe(builtins["glm-5.2"])
})

test("builtin: a provider's name for a model matches a pattern", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "anthropic", model: "claude-opus-4-1" }))
  expect(got.request.system).toBe(builtins["opus"])
})

test("builtin: an exact key wins over a pattern", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "zcode", model: "glm-5.3-flash" }))
  expect(got.request.system).toBe(builtins["glm-5.3-flash"])
  expect(got.request.system).not.toBe(builtins["glm-5.3"])
})

test("builtin: a rule of the user's wins", async () => {
  const got = await run(mod, c({ builtin: true, prompts: { "glm-5.2": "MINE." } }, { id: "zcode", model: "glm-5.2" }))
  expect(got.request.system).toBe("MINE.")
})

test("builtin: a name uses that one for every model", async () => {
  const got = await run(mod, c({ builtin: "unified" }, { id: "river", model: "any-model" }))
  expect(got.request.system).toBe(builtins["unified"])
})

test("builtin: added over the agent's own prompt, after it", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "anthropic", model: "claude-opus-4-1" }, { model: "m", system: "You code." }))
  expect(got.request.system).toBe("You code.\n" + builtins["opus"])
})

test("builtin: the global prompt still comes first", async () => {
  const got = await run(mod, c({ builtin: true, system_prompt: "GLOBAL." }, { id: "zcode", model: "glm-5.2" }))
  expect(got.request.system).toBe("GLOBAL.\n" + builtins["glm-5.2"])
})

test("builtin: no model it knows does nothing", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "river", model: "no-such-model" }))
  expect(got.request.system).toBeUndefined()
})

test("builtin: the agents filter holds", async () => {
  const got = await run(mod, c({ builtin: true, agents: ["claude"] }, { id: "zcode", model: "glm-5.2" }, { model: "m", messages: [] }, { agent: "codex" }))
  expect(got.request.system).toBeUndefined()
})

test("builtin: a name no builtin has does nothing", async () => {
  const got = await run(mod, c({ builtin: "no-such-name" }, { id: "zcode", model: "glm-5.2" }))
  expect(got.request.system).toBeUndefined()
})

test("builtin: the chat protocol takes it as the system message", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "zcode", model: "glm-5.2" }, { model: "m", messages: [{ role: "user", content: "hi" }] }, { protocol: "chat" }))
  expect(got.request.messages[0]).toEqual({ role: "system", content: builtins["glm-5.2"] })
})

test("builtin: models holds for a try too", async () => {
  const got = await run(mod, c({ builtin: true, models: ["glm-5.2"] }, { id: "zcode", model: "glm-5.2" }, { model: "group/fast", messages: [] }))
  expect(got.request.system).toBe(builtins["glm-5.2"])
})

test("builtin: a try on a model outside models gets none", async () => {
  const got = await run(mod, c({ builtin: true, models: ["kimi-k3"] }, { id: "zcode", model: "glm-5.2" }, { model: "group/fast", messages: [] }))
  expect(got.request.system).toBeUndefined()
})

test("builtin: a model's own casing matches", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "zcode", model: "GLM-5.3-Flash" }))
  expect(got.request.system).toBe(builtins["glm-5.3-flash"])
})

test("builtin: a model named after its vendor's path matches", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "nvidia", model: "stepfun-ai/step-5-preview" }))
  expect(got.request.system).toBe(builtins["step-5-preview"])
})

test("builtin: a model named with a vendor's prefix matches", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "autoclaw", model: "zai_glm-5.3-flash" }))
  expect(got.request.system).toBe(builtins["glm-5.3-flash"])
})

test("builtin: 4.1 is not v4", async () => {
  const got = await run(mod, c({ builtin: true }, { id: "amd", model: "DeepSeek-V4.1-Flash" }))
  expect(got.request.system).toBe(builtins["deepseek-4.1"])
})
