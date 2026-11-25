// A copy of magpie-community/plugins scripts/middleware.mjs (run and check
// only), so this folder's tests run where the monorepo's scripts/ is absent.
// Inside the repo the test imports scripts/middleware.mjs first and never
// reaches this file. Keep it in step with that one.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "bun:test"

export function cases(dir) {
  return JSON.parse(readFileSync(join(dir, "cases.json"), "utf8"))
}

export async function run(mod, c) {
  const m = mod.default ?? mod
  let rejected
  const ctx = {
    protocol: "anthropic", model: "", stream: false, path: "", ...c.ctx,
    options: c.options ?? {}, state: {},
    reject(status, message) { rejected ??= { status, message } },
  }
  const copy = (v) => JSON.parse(JSON.stringify(v))
  const out = {}
  if (c.request) {
    const r = m.onRequest ? await m.onRequest(copy(c.request), ctx) : undefined
    if (rejected) out.reject = rejected
    else out.request = r === undefined ? c.request : copy(r)
    if (!rejected && c.provider && m.onProvider) {
      const p = await m.onProvider(copy(out.request), { ...ctx, provider: c.provider })
      if (p !== undefined && p !== null) out.request = copy(p)
    }
  }
  return out
}

export function check(dir, mod) {
  for (const c of cases(dir)) {
    test(c.name, async () => {
      const got = await run(mod, c)
      if (c.reject) {
        expect(got.reject?.status).toBe(c.reject.status)
        if (c.reject.message) expect(got.reject?.message).toContain(c.reject.message)
      } else {
        expect(got.reject).toBeUndefined()
        if (c.request) expect(got.request).toEqual(c.expect_request ?? c.request)
      }
    })
  }
}
