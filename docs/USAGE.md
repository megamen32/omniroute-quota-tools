# Usage

## CLI

From the repository root, install the checked-in package with `npm install --global .`, then point it at an OmniRoute base URL:

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128 omniroute-quota
```

For an authenticated instance, set `OMNIROUTE_API_KEY` or `OMNIROUTE_TOKEN` and use a token with the access required by the configured endpoint. Add `--refresh` to request a provider refresh, or `--json` for automation.

## VS Code

Build a VSIX with `npm ci && npm run build && npm run package:vsix`, then install the generated `omniroute-quota-tools-0.2.2.vsix` with `code --install-extension`. Set the token through **OmniRoute Quota: Set API Token** so VS Code can keep it in SecretStorage.

See [configuration](CONFIGURATION.md) for settings and [API behavior](API.md) for the endpoint contract.
