# Providers

Bring your own key. Every provider is reduced to one internal shape, so
adding one is a table row and, at most, a new wire format.

## Supported

| Provider | Wire format | Key | Notes |
|---|---|---|---|
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
`name`, a `kind` (`anthropic`, `openai` or `gemini`), a `base` URL, a few
`models` and a `keys` link. If it speaks one of the three wire formats, that
is the whole change. If it does not, add a branch to `buildRequest()` and a
parser to `makeParser()`, and a test in `tests/providers.test.js` with a
recorded stream.
