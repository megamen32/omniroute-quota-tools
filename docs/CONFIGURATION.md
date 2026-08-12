# Configuration

The CLI accepts `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, `OMNIROUTE_TOKEN`, and `OMNIROUTE_HIDE_PROVIDERS`. The extension exposes matching base URL, auth header, hidden provider, refresh interval, quota visibility, percent mode, and critical-threshold settings under `omnirouteQuota.*`.

Prefer the extension's **Set API Token** command over putting a token in synced settings. Never commit credentials or real host-specific tokens.
