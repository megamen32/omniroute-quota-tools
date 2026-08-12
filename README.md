# OmniRoute Quota Tools

[Русский](./README.ru.md) · [简体中文](./README.zh.md)

![OmniRoute quota workflow](docs/assets/readme-hero.png)

> See every provider quota window from the terminal or a VS Code sidebar, without opening the OmniRoute dashboard.

OmniRoute Quota Tools turns OmniRoute's quota endpoints into a scriptable CLI and a compact VS Code view. It reads the same provider and usage surfaces your OmniRoute instance exposes; it does not invent quota data or promise provider availability.

## Why it is useful

- Check all quota-aware providers in one command or sidebar.
- Refresh provider limits when you need a current snapshot.
- Show account-level windows such as `5h`, weekly, and monthly when returned by OmniRoute.
- Emit JSON for Claude Code hooks and other automation.
- Hide noisy providers and keep API tokens in VS Code SecretStorage.

The CLI reads:

- `GET /api/providers/client`
- `GET /api/usage/provider-limits`
- `GET /api/usage/quota`
- optional manual refresh with `POST /api/usage/provider-limits`

## Install

The CLI requires Node.js 20 or newer. From a checkout, install the tracked package and check the command with one line:

```bash
npm install --global . && omniroute-quota --help
```

The package metadata maps `omniroute-quota` to the checked-in `dist/cli.js`; no compile step is needed for this install path. This repository does not currently publish an npm registry package, so the README does not advertise one.

For the VS Code sidebar, package the extension from this repository:

```bash
npm ci && npm run build && npm run package:vsix
```

## Start in minutes

Point the CLI at OmniRoute, then query cached quota data:

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128 omniroute-quota
```

Use `OMNIROUTE_API_KEY` (or `OMNIROUTE_TOKEN`) when the server requires a token with `manage` scope. `--refresh` asks OmniRoute to refresh provider limits before reading them.

Detailed [CLI and VS Code setup](docs/USAGE.md), [configuration](docs/CONFIGURATION.md), and [API behavior](docs/API.md) live below the fold.

## CLI usage

```bash
npm install --global .

export OMNIROUTE_BASE_URL="https://omniroute.example.com"
export OMNIROUTE_API_KEY="oma_or_api_key_with_manage_scope"
omniroute-quota --refresh
```

For local OmniRoute with auth disabled or local trust:

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128 omniroute-quota
```

JSON output for Claude Code automation:

```bash
omniroute-quota --json --refresh
```

Hide noisy providers:

```bash
omniroute-quota --hide codex,github
# or
export OMNIROUTE_HIDE_PROVIDERS=codex,github
```

For a trusted localhost setup you may also pass OmniRoute's local CLI token with `--auth-header x-omniroute-cli-token`.

### Claude Code command example

Create `.claude/commands/omniroute-quota.md` in your project:

```md
Show current OmniRoute provider quotas.

Run:
`omniroute-quota --refresh`

If the user asks for machine-readable output, run:
`omniroute-quota --json --refresh`
```

## VS Code extension

Build and install the VS Code package locally:

```bash
npm install
npm run build
npm run package:vsix
code --install-extension omniroute-quota-tools-0.2.2.vsix
```

Open the **OmniRoute Quota** activity bar icon. The sidebar is a Webview with real CSS progress bars. Provider cards expand to accounts, and each account can show multiple quota windows such as `5h`, `weekly`, and `monthly`. Use the title-bar refresh icon for cached refresh, **OmniRoute Quota: Refresh from Providers** for a live provider refresh, and **OmniRoute Quota: Toggle Free/Used** to switch bars between remaining quota and inverted usage. Red status starts at `omnirouteQuota.criticalThresholdPercent`, default 15%. Each reset row shows the reset timestamp on the left and compact time left to reset on the right, without milliseconds.

### Settings

- `omnirouteQuota.baseUrl`: OmniRoute base URL, default `http://127.0.0.1:20128`
- `omnirouteQuota.apiKey`: optional API/access token with `manage` scope; prefer the secret command below
- `omnirouteQuota.authHeader`: `authorization`, `x-api-key`, or `x-omniroute-cli-token`
- `omnirouteQuota.hiddenProviders`: list of provider slugs to hide
- `omnirouteQuota.autoRefreshIntervalSeconds`: `0` disables automatic refresh
- `omnirouteQuota.showOnlyQuotaProviders`: hide providers with no quota data
- `omnirouteQuota.percentMode`: `free` shows quota left, `used` shows inverted usage
- `omnirouteQuota.criticalThresholdPercent`: remaining quota threshold for red/critical items, default `15`

Recommended token setup:

1. Run **OmniRoute Quota: Set API Token** from the Command Palette.
2. Paste an OmniRoute access token/API key with `manage` scope.
3. The token is stored in VS Code SecretStorage, not committed to settings.

## Scope and limits

This tool is a client for an existing OmniRoute instance. It needs network access to that instance and a token when the instance requires one; it does not provision providers, change quota policy, or guarantee that a provider exposes quota windows.

The extension never ships secrets. It uses tokens from VS Code SecretStorage, settings, or environment variables. The CLI uses `OMNIROUTE_API_KEY`, `OMNIROUTE_TOKEN`, or an explicit `--token`.
