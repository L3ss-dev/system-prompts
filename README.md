# @magpie-community/middleware-system-prompts

New API's **系统提示词** (a channel's `system_prompt` and its override switch) as [magpie](https://usemagpie.ai) gateway middleware. It gives the requests agents send a system prompt of yours, in each API's own place for one:

| API | Where the prompt goes |
| --- | --- |
| Anthropic | `system` |
| Chat | the first `system` or `developer` message |
| Responses | `instructions` |
| Gemini | `systemInstruction` |

Install it from magpie's **Plugins › Discover**, or with `magpie plugin add @magpie-community/middleware-system-prompts`. Set its options under **Plugins › Installed › Options**, or with `magpie plugin options system-prompts '<json>'`.

## Options

```json
{ "system_prompt": "Reply in the language the user writes in.",
  "override": true, "position": "append",
  "agents": ["claude"], "models": ["deepseek"],
  "prompts": { "glm-4.7": "…", "/^deepseek/": { "text": "…", "position": "prepend" } },
  "builtin": true }
```

- **No system prompt yet.** A request without one gets yours.
- **`override`.** A request that has its own prompt keeps it unchanged, unless `override` is `true`. Then yours goes in as well, placed by `position`:
  - `"append"` (the default) puts yours after it. Agents cache their own prompt, so adding after it keeps that cache.
  - `"prepend"` puts yours before it, as New API does. This makes the provider read the whole prompt again on every turn.
- **`agents`.** When given, the prompt applies only to these agents, by magpie's agent ids: `claude`, `codex`, `opencode`, and so on.
- **`models`.** When given, the prompt applies only to models whose names begin with one of these prefixes, case aside. A prefix may begin magpie's whole model id (`google/gemini`) or the model's own name after any of its provider segments (`gemini-3.8-flash` matches `google/gemini-3.8-flash` and `openrouter/google/gemini-3.8-flash`). In a routing group the prompt goes only to the tries on a model in `models`: the request names the group until it is routed, so it is matched again on each try, by the model that try goes to. To give Gemini 3.8 Flash a prompt and no other model, whether it is asked directly or through a group:

  ```json
  { "system_prompt": "Answer in Chinese.", "override": true, "models": ["gemini-3.8-flash"] }
  ```

  With `prompts` or `builtin` set as well, a try on a model outside `models` gets none of it either.
- **`prompts`.** A prompt of a model's own, by the model the request actually runs on. The key is the model's id on its provider (`glm-4.7`) or with the provider's id (`zcode/glm-4.7`), exact, or written `/like this/` for a regex; an exact key wins over a regex one, and earlier regex keys win over later. The value is a string, an array of lines, or `{ "text", "override"?, "position"? }`, whose absent ones come from the global's.

  While `prompts` is set, adding waits until the gateway has routed the request: the model an agent asks for may be a routing group's, or mapped to another by model-map, and a request that fails over gets the prompt of the model it lands on. What goes in is the global prompt first, then the model's own, each by its own `override` and `position`.

- **Markdown.** `system_prompt` and a rule's text may be an array of strings instead of one string — joined with newlines — so a markdown prompt can be pasted line by line into the single-line JSON options. The text reaches the model as it is; Anthropic, Chat and Gemini render markdown in a system prompt themselves.
- **`debug`.** `true` writes one line per try to magpie's log, naming the prompts added and their length: `middleware …system-prompts [info]: system-prompts: chat zcode/GLM-5.3-Flash +42+3562 chars`. Off by default; the line proves the middleware ran and what it attached.
- **`builtin`.** `true` gives a request the prompt shipped for the model it actually runs on — one per model, built in from the [jailbreaks](https://github.com/togg53192-cmd/jailbreaks) collection: GLM 5.2/5.3 (ZCode, Flash, OpenCode, AGENTS), DeepSeek V3/V4/4.1, Kimi K2/K3/K3.1, Claude Opus/Sonnet, Qwen 3.7/3.8, Gemma 4, GPT-OSS 20B, Grok 4.7/Build, Gemini 4 Argon, Mistral Large 4, Nemotron 3 Ultra, LongCat 2.5, MiMo 2.6, Step 5 Preview, Big Pickle, Space Bunny, Muse (Spark 1.3, Wonder, AI) and Beam 1.0. A name instead of `true` (`"builtin": "unified"`) uses that one for every model; variants no model id matches on its own are named this way: `opus-v1`, `sonnet-v1`, `muse-spark-1.3-v1`, `unified`, `grok-config`, `glm-5.3-agents`.

  A `prompts` rule wins over a builtin. The global prompt still starts, then the builtin. Because a builtin is meant to replace what the model was told, it is added over the agent's own prompt (`override` on) and after it, keeping that prompt's cache — unless the builtin's own entry carries a different `override` or `position`. Models it knows nothing of get nothing. A model's name is matched whatever the case, and by the part after each `/` or `_` as well, so a provider's own path (`nvidia/stepfun-ai/step-5-preview`) or prefix (`autoclaw`'s `zai_glm-5.3-flash`, zcode's `GLM-5.3-Flash`) still finds its prompt. The prompts are generated from the collection by `builtins.gen.mjs` in this package (`node builtins.gen.mjs <jailbreaks-dir>`), and live in `system-prompts.builtins.js` — the options are parsed on every request, so a megabyte of prompts in them would be paid per request; the file is compiled once.

  `models`, when given, holds for these too: a try on a model outside it gets neither the global prompt nor a rule nor a builtin.

  The shipped example options already set `"builtin": true`, so saving the options as offered turns it on for every model below. The text of each prompt is in `system-prompts.builtins.js` beside this README; to read one, `node -e 'import("./system-prompts.builtins.js").then(m => console.log(m.builtins["glm-5.2"]))'`.

### Built-in prompts

| Source file | Keys |
| --- | --- |
| BigPickle-opencode.md | `big-pickle`, `/^big-?pickle/` |
| spacebunny-agents.md | `space-bunny`, `/^space-?bunny/` |
| longcat-agents.md | `longcat-2.5`, `/^longcat/` |
| mimo-2.6-agents.md | `mimo-2.6`, `/^mimo-2\.6/` |
| Step-5-preview.md | `step-5-preview`, `/^step-5/` |
| Muse-spark-1-3-v2.md | `muse-spark-1.3`, `/^muse-spark/` |
| Muse spark 1.3.md | `muse-spark-1.3-v1` |
| muse-ai-AGENTS.md | `muse-ai`, `/^muse-ai/` |
| Muse-wonder.md | `muse-wonder`, `/^muse-wonder/` |
| Beam.md | `beam-1.0`, `/^beam/` |
| Unified.md | `unified` |
| opus v2.md | `opus`, `/^claude-opus/` |
| opus v1.md | `opus-v1` |
| Sonnet v2.md | `sonnet`, `/^claude-sonnet/` |
| sonnet v1.md | `sonnet-v1` |
| glm-5.2.md | `glm-5.2`, `/^glm-5\.2/` |
| glm-zcode-5.2.md | `zcode/glm-5.2` |
| glm-zcode-5.3.md | `glm-5.3`, `zcode/glm-5.3`, `/^glm-5\.3/` |
| glm-5-3-flash.md | `glm-5.3-flash` |
| glm5-3opencode.md | `glm-5.3-opencode` |
| glm-zcode-5.3-AGENTS.md | `glm-5.3-agents` |
| deepseek v3.md | `deepseek-v3`, `/^deepseek-(chat|reasoner|v3)/` |
| deepseek v4.md | `deepseek-v4`, `/^deepseek-v4/` |
| deepseek-4-1.md | `deepseek-4.1`, `/^deepseek-4\.1/` |
| kimi-k2.md | `kimi-k2`, `/^kimi-k2/` |
| kimi-k3-agents.md | `kimi-k3`, `/^kimi-k3/` |
| kimik3.1.md | `kimi-k3.1` |
| Grok build.md | `grok-build`, `/^grok-build/` |
| grok-4.7.md | `grok-4.7`, `/^grok-4/` |
| grok-config.txt | `grok-config` |
| nemotron-3-ultra.md | `nemotron-3-ultra`, `/^nemotron-3/` |
| Gemini-4-Argon.md | `gemini-4-argon`, `/^gemini-4/` |
| Mistral-Large-4.md | `mistral-large-4`, `/^mistral-large/` |
| qwen-3.7.md | `qwen-3.7`, `/^qwen-3\.7/` |
| qwen-3.8.md | `qwen-3.8`, `/^qwen-3\.8/` |
| gemma4.md | `gemma4`, `/^gemma-?4/` |
| gpt-oss-20b.md | `gpt-oss-20b`, `/^gpt-oss/` |

Codex sends its own model instructions, and changing them can change how its models behave. Use `agents` to leave Codex out if you don't want that.


中文补充：`prompts` 给某个模型一段自己的提示词，键是该模型在其 provider 上的 id（如 `glm-4.7` 或 `zcode/glm-4.7`），也可以写 `/正则/`；精确键优先于正则键。设了 `prompts` 后，注入推迟到网关路由之后，按实际运行的模型匹配——agent 请求的名字可能是路由组的，也可能被 model-map 改写过，失败转移到哪个模型就用哪个模型的提示词。全局提示词先注入，模型专属的随后，各自的 `override` 和 `position` 独立（不设则沿用全局的）。
中文：New API 的「系统提示词」，作为 magpie 网关中间件。默认把你的提示词加在 agent 自己的提示词之后，这样不会破坏提示缓存。

中文补充：`system_prompt` 和 `prompts` 里的文本都可以写成字符串数组（每项一行，注入时用换行连接），方便把多行 markdown 提示词逐行贴进单行 JSON；文本原样交给模型，Anthropic / Chat / Gemini 的系统提示词本身支持 markdown 渲染。

中文补充：`builtin: true` 按请求实际落到的模型，注入该模型的内置提示词（内置自 jailbreaks 合集，覆盖 GLM 5.2/5.3 各变体、DeepSeek V3/V4/4.1、Kimi K2/K3/K3.1、Claude Opus/Sonnet、Qwen 3.7/3.8、Gemma 4、GPT-OSS 20B、Grok 4.7/Build、Gemini 4 Argon、Mistral Large 4、Nemotron 3 Ultra、LongCat 2.5、MiMo 2.6、Step 5 Preview、Big Pickle、Space Bunny、Muse、Beam 1.0）。也可以写名字（如 `"builtin": "unified"`）让所有模型统一使用某一个；模型 id 匹配不到的变体（`opus-v1`、`sonnet-v1`、`muse-spark-1.3-v1`、`unified`、`grok-config`、`glm-5.3-agents`）用名字选取。模型名匹配不区分大小写，也会按每个 `/`、`_` 之后的部分匹配：`nvidia/stepfun-ai/step-5-preview`、`autoclaw` 的 `zai_glm-5.3-flash`、zcode 的 `GLM-5.3-Flash` 都能找到各自的提示词。`prompts` 规则优先于内置；全局提示词在前、内置在后；内置默认覆盖（override 开）且追加在 agent 自有提示词之后（保缓存）。不认识的模型不注入。

中文补充：内置提示词的正文放在包内 `system-prompts.builtins.js`（编译期加载一次），不放进 options——magpie 每个请求都会解析一次 options，把几十万字提示词塞进去等于每个请求都付一次解析代价。示例 options 已带 `"builtin": true`，按示例保存即对所有匹配模型生效；上表列出每个源文件对应的键，全部条目和正文都可在该文件里查看（`node -e 'import("./system-prompts.builtins.js").then(m => console.log(m.builtins["glm-5.2"]))'`）。
中文补充：`models` 按模型名前缀匹配（不分大小写），可以写完整 id（如 `google/gemini`），也可以只写模型名（如 `gemini-3.8-flash`，会匹配 `google/gemini-3.8-flash`、`openrouter/google/gemini-3.8-flash`）。路由组的请求在路由前只写着组名，因此每次 try 在 `onProvider` 里按实际落到的模型再匹配一次；不在 `models` 里的 try 既不加全局提示词，也不加 `prompts` 规则和 `builtin`。
中文补充：`debug: true` 时每次注入往 magpie 日志写一行（`system-prompts: chat zcode/GLM-5.3-Flash +42+3562 chars`），用来确认中间件真的跑了、加了多长的提示词；默认关闭。
