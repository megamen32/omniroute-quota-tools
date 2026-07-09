import * as vscode from "vscode";
import {
  getQuotaSnapshot,
  refreshProviderCaches,
  formatPercent,
  worstRemainingPercent,
  type ProviderQuotaEntry,
  type QuotaSnapshot,
} from "./omnirouteClient";

type PercentMode = "free" | "used";

type WebviewMessage =
  | { type: "refresh" }
  | { type: "forceRefresh" }
  | { type: "toggleMode" }
  | { type: "hideProvider"; provider?: string }
  | { type: "openSettings" };

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("omnirouteQuota");
}

function percentMode(): PercentMode {
  return config().get<PercentMode>("percentMode") === "used" ? "used" : "free";
}

function displayPercent(freePercent: number | null, mode: PercentMode): number | null {
  if (freePercent === null) return null;
  return mode === "used" ? Math.max(0, Math.min(100, 100 - freePercent)) : freePercent;
}

function criticalThreshold(): number {
  const value = config().get<number>("criticalThresholdPercent");
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 15;
}

function statusClass(freePercent: number | null): "empty" | "critical" | "warn" | "ok" {
  if (freePercent === null) return "empty";
  if (freePercent <= criticalThreshold()) return "critical";
  if (freePercent <= 25) return "warn";
  return "ok";
}

function accountCountLabel(count: number): string {
  return count === 1 ? "1 acct" : `${count} accts`;
}

function compactReset(resetAt: string | null | undefined): string {
  if (!resetAt) return "";
  const date = new Date(resetAt);
  if (!Number.isFinite(date.getTime())) return "↻";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `↻ ${month}-${day} ${hour}:${minute}`;
}

function compactDurationUntil(targetAt: string | null | undefined): string {
  if (!targetAt) return "";
  const target = new Date(targetAt).getTime();
  if (!Number.isFinite(target)) return "";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "expired";
  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function htmlEscape(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function providerGroups(snapshot: QuotaSnapshot | null): Array<[string, ProviderQuotaEntry[]]> {
  const byProvider = new Map<string, ProviderQuotaEntry[]>();
  for (const entry of snapshot?.entries ?? []) {
    if (!byProvider.has(entry.provider)) byProvider.set(entry.provider, []);
    byProvider.get(entry.provider)?.push(entry);
  }
  return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function renderBar(label: string, freePercent: number | null, mode: PercentMode, resetAt?: string | null): string {
  const shown = displayPercent(freePercent, mode);
  const width = shown === null ? 0 : Math.max(0, Math.min(100, shown));
  const status = statusClass(freePercent);
  const pct = formatPercent(shown);
  const reset = compactReset(resetAt);
  const remaining = compactDurationUntil(resetAt);
  return `
    <div class="quota-bar-row ${status}">
      <div class="quota-bar-meta">
        <span class="quota-window" title="${htmlEscape(label)}">${htmlEscape(truncate(label, 28))}</span>
        <span class="quota-pct">${htmlEscape(pct)} ${htmlEscape(mode)}</span>
      </div>
      <div class="quota-track" title="${htmlEscape(label)}: ${htmlEscape(pct)} ${htmlEscape(mode)}${reset ? ` • ${htmlEscape(reset)}` : ""}${remaining ? ` • ${htmlEscape(remaining)} left` : ""}">
        <div class="quota-fill" style="width:${width}%"></div>
      </div>
      ${reset ? `<div class="quota-reset"><span>${htmlEscape(reset)}</span>${remaining ? `<span class="quota-reset-left">${htmlEscape(remaining)} left</span>` : ""}</div>` : ""}
    </div>`;
}

function renderAccount(entry: ProviderQuotaEntry, mode: PercentMode): string {
  const worstFree = worstRemainingPercent(entry);
  const status = statusClass(worstFree);
  const windows = entry.windows.length
    ? entry.windows.map((window) => renderBar(window.label, window.exhausted ? 0 : window.remainingPercent, mode, window.resetAt)).join("")
    : renderBar("summary", entry.summaryRemainingPercent, mode, entry.summaryResetAt);
  const subtitle = [entry.email && entry.email !== entry.name ? entry.email : null, entry.plan, entry.message]
    .filter(Boolean)
    .map((x) => htmlEscape(String(x)))
    .join(" • ");
  return `
    <details class="account ${status}" open>
      <summary>
        <span class="dot ${status}"></span>
        <span class="account-name" title="${htmlEscape(entry.name)}">${htmlEscape(truncate(entry.name, 42))}</span>
        <span class="account-worst">${htmlEscape(formatPercent(displayPercent(worstFree, mode)))} ${htmlEscape(mode)}</span>
      </summary>
      ${subtitle ? `<div class="account-subtitle">${subtitle}</div>` : ""}
      <div class="bars">${windows}</div>
    </details>`;
}

function renderProvider(provider: string, entries: ProviderQuotaEntry[], mode: PercentMode): string {
  const worstFree = Math.min(...entries.map((entry) => worstRemainingPercent(entry) ?? 100));
  const status = statusClass(worstFree);
  const accounts = entries.map((entry) => renderAccount(entry, mode)).join("");
  return `
    <details class="provider ${status}" open>
      <summary class="provider-summary">
        <span class="dot ${status}"></span>
        <span class="provider-name">${htmlEscape(provider)}</span>
        <span class="provider-meta">${htmlEscape(formatPercent(displayPercent(worstFree, mode)))} ${htmlEscape(mode)} • ${htmlEscape(accountCountLabel(entries.length))}</span>
      </summary>
      <div class="provider-actions">
        <button data-action="hideProvider" data-provider="${htmlEscape(provider)}" title="Hide provider">hide</button>
      </div>
      <div class="accounts">${accounts}</div>
    </details>`;
}

function renderHtml(snapshot: QuotaSnapshot | null, error: string | null, nonce: string): string {
  const mode = percentMode();
  const groups = providerGroups(snapshot);
  const content = error
    ? `<div class="empty error">${htmlEscape(error)}</div>`
    : groups.length
      ? groups.map(([provider, entries]) => renderProvider(provider, entries, mode)).join("")
      : `<div class="empty">No quota data yet.</div>`;
  const generated = snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleTimeString() : "never";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
:root {
  --ok: #30c85a;
  --warn: #d7b423;
  --critical: #f14c4c;
  --empty: #8b949e;
  --track: color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent);
  --card: color-mix(in srgb, var(--vscode-editor-foreground) 5%, transparent);
  --border: color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
}
* { box-sizing: border-box; }
body { margin: 0; padding: 8px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: var(--vscode-font-weight) var(--vscode-font-size) var(--vscode-font-family); }
.toolbar { display: flex; gap: 4px; align-items: center; margin-bottom: 8px; position: sticky; top: 0; z-index: 5; background: var(--vscode-sideBar-background); padding-bottom: 6px; }
.toolbar button, .provider-actions button { border: 1px solid var(--border); border-radius: 4px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); padding: 2px 6px; font-size: 11px; cursor: pointer; }
.toolbar button:hover, .provider-actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
.spacer { flex: 1; }
.mode, .updated { color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
details { margin: 0; }
summary { cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
.provider { border: 1px solid var(--border); border-radius: 8px; margin: 0 0 8px; background: var(--card); overflow: hidden; }
.provider-summary { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 8px; }
.provider-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-meta { color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
.provider-actions { padding: 0 8px 4px 26px; }
.accounts { padding: 0 6px 6px 18px; }
.account { border-top: 1px solid var(--border); padding: 6px 0 5px; }
.account:first-child { border-top: 0; }
.account summary { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 0 2px; }
.account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-worst { color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
.account-subtitle { color: var(--vscode-descriptionForeground); font-size: 11px; padding: 2px 2px 0 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bars { padding: 5px 2px 0 20px; display: grid; gap: 6px; }
.quota-bar-row { display: grid; gap: 2px; }
.quota-bar-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: baseline; }
.quota-window { font-size: 11px; color: var(--vscode-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quota-pct, .quota-reset { font-size: 10px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
.quota-reset { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.quota-reset-left { text-align: right; color: var(--vscode-foreground); opacity: 0.78; }
.quota-track { height: 8px; border-radius: 999px; background: var(--track); overflow: hidden; box-shadow: inset 0 0 0 1px var(--border); }
.quota-fill { height: 100%; min-width: 2px; border-radius: inherit; background: var(--ok); transition: width 160ms ease; }
.quota-bar-row.warn .quota-fill { background: var(--warn); }
.quota-bar-row.critical .quota-fill { background: var(--critical); }
.quota-bar-row.empty .quota-fill { background: var(--empty); min-width: 0; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--ok); box-shadow: 0 0 6px color-mix(in srgb, var(--ok) 70%, transparent); }
.dot.warn { background: var(--warn); box-shadow: 0 0 6px color-mix(in srgb, var(--warn) 70%, transparent); }
.dot.critical { background: var(--critical); box-shadow: 0 0 6px color-mix(in srgb, var(--critical) 70%, transparent); }
.dot.empty { background: var(--empty); box-shadow: none; }
.empty { color: var(--vscode-descriptionForeground); padding: 12px 4px; }
.empty.error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="toolbar">
    <button data-action="refresh" title="Refresh cached quotas">Refresh</button>
    <button data-action="forceRefresh" title="Refresh from providers">Force</button>
    <button data-action="toggleMode" title="Toggle free/used">${htmlEscape(mode)}</button>
    <button data-action="openSettings" title="Open settings">⚙</button>
    <span class="spacer"></span>
  </div>
  <div class="updated">updated ${htmlEscape(generated)} • red ≤ ${criticalThreshold()}% free</div>
  <div class="content">${content}</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  vscode.postMessage({ type: target.dataset.action, provider: target.dataset.provider });
});
</script>
</body>
</html>`;
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

class QuotaWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | null = null;
  private snapshot: QuotaSnapshot | null = null;
  private error: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.resetTimer();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message), undefined, this.context.subscriptions);
    this.render();
    void this.refresh(false);
  }

  private async token(): Promise<string | undefined> {
    return (await this.context.secrets.get("omnirouteQuota.apiToken")) || config().get<string>("apiKey") || process.env.OMNIROUTE_API_KEY || process.env.OMNIROUTE_TOKEN;
  }

  private options() {
    return {
      baseUrl: config().get<string>("baseUrl") || "http://127.0.0.1:20128",
      authHeader: config().get<"authorization" | "x-api-key" | "x-omniroute-cli-token">("authHeader") || "authorization",
    };
  }

  resetTimer(): void {
    if (this.timer) clearInterval(this.timer);
    const seconds = config().get<number>("autoRefreshIntervalSeconds") || 0;
    if (seconds > 0) this.timer = setInterval(() => void this.refresh(false), Math.max(15, seconds) * 1000);
  }

  async refresh(showNotice = true): Promise<void> {
    this.error = null;
    this.render();
    try {
      this.snapshot = await getQuotaSnapshot(
        { ...this.options(), token: await this.token() },
        {
          hiddenProviders: config().get<string[]>("hiddenProviders") || [],
          showOnlyQuotaProviders: config().get<boolean>("showOnlyQuotaProviders") ?? true,
        }
      );
      if (showNotice) vscode.window.setStatusBarMessage(`OmniRoute quota refreshed: ${this.snapshot.connectionCount} accounts`, 3000);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      if (showNotice) vscode.window.showErrorMessage(`OmniRoute quota refresh failed: ${this.error}`);
    } finally {
      this.render();
    }
  }

  async forceRefresh(): Promise<void> {
    try {
      await refreshProviderCaches({ ...this.options(), token: await this.token() });
      await this.refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error = message;
      this.render();
      vscode.window.showErrorMessage(`OmniRoute provider refresh failed: ${message}`);
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "refresh") await this.refresh(true);
    if (message.type === "forceRefresh") await this.forceRefresh();
    if (message.type === "toggleMode") await this.togglePercentMode();
    if (message.type === "openSettings") await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:omniroute-quota-tools");
    if (message.type === "hideProvider" && message.provider) await this.hideProvider(message.provider);
  }

  async togglePercentMode(): Promise<void> {
    const next = percentMode() === "free" ? "used" : "free";
    await config().update("percentMode", next, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`OmniRoute quota mode: ${next}`, 2500);
    this.render();
  }

  async hideProvider(provider: string): Promise<void> {
    const hidden = new Set(config().get<string[]>("hiddenProviders") || []);
    hidden.add(provider);
    await config().update("hiddenProviders", [...hidden].sort(), vscode.ConfigurationTarget.Global);
    await this.refresh(true);
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = renderHtml(this.snapshot, this.error, nonce());
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QuotaWebviewProvider(context);
  context.subscriptions.push(provider, vscode.window.registerWebviewViewProvider("omnirouteQuota.providers", provider));

  context.subscriptions.push(
    vscode.commands.registerCommand("omnirouteQuota.refresh", () => provider.refresh(true)),
    vscode.commands.registerCommand("omnirouteQuota.forceRefresh", () => provider.forceRefresh()),
    vscode.commands.registerCommand("omnirouteQuota.togglePercentMode", () => provider.togglePercentMode()),
    vscode.commands.registerCommand("omnirouteQuota.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "@ext:omniroute-quota-tools")),
    vscode.commands.registerCommand("omnirouteQuota.setToken", async () => {
      const token = await vscode.window.showInputBox({ prompt: "OmniRoute API key/access token with manage scope", password: true, ignoreFocusOut: true });
      if (!token) return;
      await context.secrets.store("omnirouteQuota.apiToken", token);
      vscode.window.showInformationMessage("OmniRoute token stored in VS Code SecretStorage.");
      await provider.refresh(true);
    }),
    vscode.commands.registerCommand("omnirouteQuota.clearToken", async () => {
      await context.secrets.delete("omnirouteQuota.apiToken");
      vscode.window.showInformationMessage("Stored OmniRoute token cleared.");
    }),
    vscode.commands.registerCommand("omnirouteQuota.clearHiddenProviders", async () => {
      await config().update("hiddenProviders", [], vscode.ConfigurationTarget.Global);
      await provider.refresh(true);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("omnirouteQuota")) {
        provider.resetTimer();
        void provider.refresh(false);
      }
    })
  );
}

export function deactivate(): void {}
