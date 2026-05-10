# imagegen-mcp

Provider-agnostic MCP server for image generation. One config file, four tools, switch between OpenAI, Stability AI, Replicate, or any OpenAI-compatible backend by name.

## Why this exists

Existing MCP wrappers hard-code OpenAI models, refuse new IDs (`gpt-image-1.5`), and don't speak Stability or Replicate. This one is a thin shell: providers are pluggable, model strings pass through, env-file paths are configurable, no surprises.

## Install

```bash
git clone <repo-url> ~/projects/own-projects/imagegen-mcp
cd ~/projects/own-projects/imagegen-mcp
pnpm install   # or npm / yarn
```

Requires Node ≥22.

## Configure

Copy the example, edit, place at `~/.config/imagegen-mcp/config.json` (or set `IMAGEGEN_MCP_CONFIG=/some/path.json`):

```bash
mkdir -p ~/.config/imagegen-mcp
cp config.example.json ~/.config/imagegen-mcp/config.json
$EDITOR ~/.config/imagegen-mcp/config.json
```

Schema:

```json
{
  "providers": {
    "<name>": {
      "type": "openai" | "stability" | "replicate",
      "envFile": "~/path/to/secret.env",   // optional; falls back to process.env
      "envVar": "NAME_OF_KEY_VAR",
      "baseUrl": "https://custom"          // optional override
    }
  },
  "defaultProvider": "<name>",
  "defaultModel": "<model id>"
}
```

`envFile` parses simple `KEY=VALUE` lines (comments + quoted strings allowed). If the file is missing the server falls back to `process.env[envVar]`.

`openai` is also used for OpenAI-compatible servers (your local LLM stack, llama.cpp images, etc.) by setting a custom `baseUrl`.

## Wire into Claude Code

```bash
claude mcp add imagegen -- npx -y tsx ~/projects/own-projects/imagegen-mcp/src/server.ts
```

Verify in Claude Code: `/mcp` → `imagegen: ✓ Connected`. Tools appear as `mcp__imagegen__*`.

## Tools

### `generate_image`

Text-to-image. Saves to disk.

| Field | Type | Notes |
|---|---|---|
| `prompt` | string | required |
| `outputPath` | string | required, absolute path |
| `provider` | string? | defaults to `defaultProvider` |
| `model` | string? | defaults to `defaultModel`; pass anything the provider accepts |
| `size` | string? | provider-specific (`1536x1024`, `16:9`, etc.) |
| `quality` | string? | `high`/`hd`/`standard`/etc. |
| `n` | number? | default 1 |
| `output_format` | enum? | `png` / `jpeg` / `webp` |
| `background` | enum? | OpenAI gpt-image only |
| `style` | enum? | DALL·E 3 only |
| `moderation` | enum? | OpenAI gpt-image only |
| `extras` | object? | arbitrary passthrough (provider-specific knobs) |

### `edit_image`

Image edit / inpaint. Throws when the provider doesn't support edits.

| Field | Type | Notes |
|---|---|---|
| `prompt` | string | required |
| `images` | string[] | required, absolute paths |
| `mask` | string? | transparent areas = editable region |
| `outputPath` | string | required |
| _(same generation params as above)_ | | |

### `list_image_models`

Returns image-capable model IDs per provider. When `provider` is omitted, queries all configured providers.

### `crop_image`

Sharp-based resize / crop. Useful for converting raw generations into editorial aspect ratios (e.g. 1792×1024 → 1792×784 for 16:7).

| Field | Type | Notes |
|---|---|---|
| `inputPath` | string | required |
| `outputPath` | string | required |
| `width` | number | required |
| `height` | number | required |
| `mode` | enum | `cover` (default) / `contain` / `fill` |
| `gravity` | enum | sharp position (default `center`) |
| `format` | enum? | `png` / `jpeg` / `webp` (inferred from extension otherwise) |
| `quality` | number? | for jpeg / webp |

## Adding a provider

1. Implement `Provider` in `src/providers/<name>.ts` (see `base.ts` for the interface — only `generate` is mandatory).
2. Wire it into `src/providers/index.ts` switch.
3. Extend the `ProviderSchema.type` enum in `src/config.ts`.

Each provider owns its own auth, request, polling, and response parsing. No shared HTTP client by design — image APIs differ too much.

## Development

```bash
pnpm typecheck
pnpm dev   # runs the server on stdio for manual testing
```

## License

MIT
