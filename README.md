# OmniRoute Quota Tools

CLI + VS Code sidebar for OmniRoute provider quotas. It mirrors the OmniRoute dashboard quota surfaces by reading:

- `GET /api/providers/client`
- `GET /api/usage/provider-limits`
- `GET /api/usage/quota`
- optional manual refresh with `POST /api/usage/provider-limits`

The CLI is useful from Claude Code hooks/commands; the VS Code extension shows all quota-aware provider accounts in a sidebar, with provider hiding and manual refresh.

## CLI usage

```bash
npm install -g omniroute-quota-tools

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

Build and install locally:

```bash
npm install
npm run build
npm run package:vsix
code --install-extension omniroute-quota-tools-0.2.1.vsix
```

Open the **OmniRoute Quota** activity bar icon. The sidebar is a Webview with real CSS progress bars. Provider cards expand to accounts, and each account can show multiple quota windows such as `5h`, `weekly`, and `monthly`. Use the title-bar refresh icon for cached refresh, **OmniRoute Quota: Refresh from Providers** for a live provider refresh, and **OmniRoute Quota: Toggle Free/Used** to switch bars between remaining quota and inverted usage. Red status starts at `omnirouteQuota.criticalThresholdPercent`, default 15%.

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

## Notes

The extension never ships secrets. It only uses tokens from VS Code SecretStorage, settings, or environment variables. The CLI uses `OMNIROUTE_API_KEY`, `OMNIROUTE_TOKEN`, or an explicit `--token`.
