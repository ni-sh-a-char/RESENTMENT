# Providers

Bring your own key. Every provider is reduced to one internal shape, so
adding one is a table row and, at most, a new wire format.

## Supported

| Provider | Wire format | Key | Notes |
|---|---|---|---|
| **In your browser (WebGPU)** | WebLLM, in a worker | none | the model runs on your own GPU inside the tab; no server, nothing leaves the machine; see below |
| Anthropic | Messages API | [console](https://console.anthropic.com/settings/keys) | streaming, tool use; adaptive thinking is the model's default and nothing is sent to change it |
| OpenAI | `/chat/completions` | [platform](https://platform.openai.com/api-keys) | |
| Google Gemini | `generateContent` | [AI Studio](https://aistudio.google.com/apikey) | function calls get client-side ids |
| Groq | `/chat/completions` | [console](https://console.groq.com/keys) | |
| Mistral | `/chat/completions` | [console](https://console.mistral.ai/api-keys) | |
| xAI | `/chat/completions` | [console](https://console.x.ai) | |
| DeepSeek | `/chat/completions` | [platform](https://platform.deepseek.com/api_keys) | |
| OpenRouter | `/chat/completions` | [keys](https://openrouter.ai/keys) | sends the referer header OpenRouter asks for |
| Together | `/chat/completions` | [settings](https://api.together.xyz/settings/api-keys) | |
| Ollama | `/chat/completions` | none | local; see below |
| LM Studio | `/chat/completions` | none | local; see below |
| Anything OpenAI-compatible | `/chat/completions` | as needed | vLLM, llama.cpp, LiteLLM, a proxy: set the base URL |

## The internal shape

Messages are the Anthropic shape: `{role, content: [blocks]}` where a block is
`text`, `tool_use` or `tool_result`. A `tool_result` also carries the tool's
`name`, which Gemini needs and the others ignore. `buildRequest()` turns that
into each wire format; `makeParser()` turns each wire format's stream events
into `text`, `tool`, `usage` and `stop`. Both are pure functions with tests
against recorded events.

## Inside the browser, on your GPU

Pick **In your browser (WebGPU, no server)** in Settings. There is no key
and no server: the model runs inside the tab on your GPU through the
[WebLLM](https://github.com/mlc-ai/web-llm) runtime, in a web worker so the
desktop stays responsive. The first use downloads the weights (0.5 to 5 GB
depending on the model) into the browser's cache and reports progress in the
chat's status line; after that it is instant and works offline.

- **Needs WebGPU**: Chrome or Edge on any desktop, Safari 26 on macOS and
  iOS. Firefox is catching up. Without it the provider says so and points
  at Ollama.
- **Models**: press *Fetch models* to list everything the runtime offers
  (Llama 3.2 and 3.1, Hermes 3, Qwen 3, Phi 4 mini, Gemma 2, SmolLM2,
  DeepSeek-R1 distills). Start with `Llama-3.2-3B-Instruct-q4f16_1-MLC`
  (about 2 GB) or `Qwen3-0.6B-q4f16_1-MLC` (about 0.5 GB) on a laptop.
- **Tools**: only the Hermes models know how to call functions, so only
  they get the tool list; the others answer in text. The runtime's own
  list of tool-capable models is what decides, not a guess here.
- **Memory**: an 8B model wants about 6 GB of GPU memory; a 3B model about
  2.5 GB. If the tab crashes, choose a smaller one.

This is the one place the desktop loads code from a CDN
(`cdn.jsdelivr.net/npm/@mlc-ai/web-llm`, pinned to a version), and it does so
only when this provider is chosen. A GPU inference engine is not something
to rewrite for the sake of a rule; the rule's purpose, that you can read
what runs, still holds: the runtime is open source and the pin is in
`providers.js`.

For local models with more control (any GGUF, CPU inference, bigger
contexts), run Ollama or LM Studio and pick those instead; they speak
`/chat/completions` and are listed above.

## Calling from a browser

The page is the client. There is no server between you and the provider, so
the provider must allow cross-origin requests from a browser.

- **Anthropic** requires the header `anthropic-dangerous-direct-browser-access: true`,
  which the desktop sends. The name is the SDK's, and it is honest: the key is
  in the browser. That is the point of this OS, and the key is yours.
- **OpenAI, Groq, Mistral, xAI, DeepSeek, OpenRouter, Together, Gemini** allow
  browser calls.
- **Ollama** must be started with `OLLAMA_ORIGINS=*` (or the origin the desktop
  is served from) or it refuses the preflight. No key.
- **LM Studio** has a CORS switch in its server settings. No key.
- A **corporate proxy or a browser extension** that rewrites requests will
  show up as "could not reach". The Test button in Settings tells you which.

## Where the key lives

In this browser's IndexedDB, under the vault's own keys, which the digest
does not read. Plain by default. With a passphrase, sealed under AES-GCM with
a key derived by PBKDF2 (200 000 rounds, SHA-256) and unlocked once per
session. Export never includes it. Nothing in the desktop makes a request to
anything but the provider endpoint you configured.

## Anthropic refusal fallbacks

Anthropic's newest models can decline a request; the API can re-run a
declined request on another Claude model server-side. It is a beta, so it is
off by default and a checkbox in Settings turns it on. When on, the desktop
sends `anthropic-beta: server-side-fallback-2026-07-01` and
`"fallbacks": "default"`.

## Adding a provider

Add a row to `PROVIDERS` in `os/desktop/js/providers.js` with an `id`, a
`name`, a `kind` (`anthropic`, `openai`, `gemini` or `webllm`), a `base` URL, a few
`models` and a `keys` link. If it speaks one of the three wire formats, that
is the whole change. If it does not, add a branch to `buildRequest()` and a
parser to `makeParser()`, and a test in `tests/providers.test.js` with a
recorded stream.
