import * as vscode from "vscode";
import {
  getQuotaSnapshot,
  refreshProviderCaches,
  formatPercent,
  worstRemainingPercent,
  type ProviderQuotaEntry,
  type QuotaSnapshot,
} from "./omnirouteClient";

type NodeKind = "root" | "provider" | "connection" | "window" | "message";
type PercentMode = "free" | "used";

class QuotaNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    public readonly labelText: string,
    public readonly entry?: ProviderQuotaEntry,
    public readonly detail?: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(labelText, collapsibleState);
    this.contextValue = kind;
    if (detail) this.description = detail;
  }
}

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

function compactBar(value: number | null): string {
  if (value === null) return "▱▱▱▱▱";
  const filled = Math.max(0, Math.min(5, Math.round(value / 20)));
  return "▰".repeat(filled) + "▱".repeat(5 - filled);
}

function compactStatus(value: number | null, mode: PercentMode): string {
  const shown = displayPercent(value, mode);
  return `${compactBar(shown)} ${formatPercent(shown)}`;
}

function criticalThreshold(): number {
  const value = config().get<number>("criticalThresholdPercent");
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 15;
}

function compactReset(resetAt: string | null | undefined): string {
  if (!resetAt) return "";
  const date = new Date(resetAt);
  if (!Number.isFinite(date.getTime())) return " ↻";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return ` ↻ ${month}-${day} ${hour}:${minute}`;
}

function iconForFreePercent(value: number | null): vscode.ThemeIcon {
  if (value !== null && value <= criticalThreshold()) {
    return new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red"));
  }
  if (value !== null && value <= 25) {
    return new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.yellow"));
  }
  return new vscode.ThemeIcon("pass", new vscode.ThemeColor("charts.green"));
}

function accountCountLabel(count: number): string {
  return count === 1 ? "1 acct" : `${count} accts`;
}

class QuotaTreeProvider implements vscode.TreeDataProvider<QuotaNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<QuotaNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private snapshot: QuotaSnapshot | null = null;
  private error: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.resetTimer();
  }

  dispose(): void {
    this.emitter.dispose();
    if (this.timer) clearInterval(this.timer);
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
    if (seconds > 0) {
      this.timer = setInterval(() => void this.refresh(false), Math.max(15, seconds) * 1000);
    }
  }

  async refresh(showNotice = true): Promise<void> {
    this.error = null;
    this.emitter.fire();
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
      this.emitter.fire();
    }
  }

  async forceRefresh(): Promise<void> {
    try {
      await refreshProviderCaches({ ...this.options(), token: await this.token() });
      await this.refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`OmniRoute provider refresh failed: ${message}`);
    }
  }

  getTreeItem(element: QuotaNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: QuotaNode): QuotaNode[] {
    const mode = percentMode();
    if (this.error) return [new QuotaNode("message", "Refresh failed", undefined, this.error)];
    if (!this.snapshot) return [new QuotaNode("message", "No data yet", undefined, "Run refresh")];

    if (!element) {
      const byProvider = new Map<string, ProviderQuotaEntry[]>();
      for (const entry of this.snapshot.entries) {
        if (!byProvider.has(entry.provider)) byProvider.set(entry.provider, []);
        byProvider.get(entry.provider)?.push(entry);
      }
      return [...byProvider.entries()].map(([provider, entries]) => {
        const worstFree = Math.min(...entries.map((entry) => worstRemainingPercent(entry) ?? 100));
        const node = new QuotaNode(
          "provider",
          provider,
          undefined,
          `${compactStatus(worstFree, mode)} ${mode} • ${accountCountLabel(entries.length)}`,
          vscode.TreeItemCollapsibleState.Expanded
        );
        node.iconPath = iconForFreePercent(worstFree);
        node.tooltip = `Provider ${provider}\nWorst free: ${formatPercent(worstFree)}\nShown as: ${mode}\nRed threshold: ${criticalThreshold()}% free`;
        return node;
      });
    }

    if (element.kind === "provider") {
      return this.snapshot.entries
        .filter((entry) => entry.provider === element.labelText)
        .map((entry) => {
          const worstFree = worstRemainingPercent(entry);
          const node = new QuotaNode(
            "connection",
            entry.name,
            entry,
            `${compactStatus(worstFree, mode)} ${mode}`,
            vscode.TreeItemCollapsibleState.Collapsed
          );
          node.tooltip = [
            `Provider: ${entry.provider}`,
            `Connection: ${entry.connectionId}`,
            `Worst free: ${formatPercent(worstFree)}`,
            `Shown as: ${mode}`,
            `Red threshold: ${criticalThreshold()}% free`,
            entry.fetchedAt ? `Fetched: ${entry.fetchedAt}` : "",
            entry.message ? `Message: ${entry.message}` : "",
          ].filter(Boolean).join("\n");
          node.iconPath = iconForFreePercent(worstFree);
          return node;
        });
    }

    if (element.kind === "connection" && element.entry) {
      const children = element.entry.windows.map((window) => {
        const free = window.remainingPercent;
        const node = new QuotaNode(
          "window",
          window.label,
          element.entry,
          `${compactStatus(free, mode)} ${mode}${compactReset(window.resetAt)}`
        );
        node.tooltip = JSON.stringify(window.raw, null, 2);
        node.iconPath = iconForFreePercent(window.exhausted ? 0 : free);
        return node;
      });
      if (element.entry.message) {
        const node = new QuotaNode("message", "Message", element.entry, element.entry.message);
        node.iconPath = new vscode.ThemeIcon("info");
        children.unshift(node);
      }
      if (children.length === 0 && element.entry.summaryRemainingPercent !== null) {
        const node = new QuotaNode("window", "Summary", element.entry, `${compactStatus(element.entry.summaryRemainingPercent, mode)} ${mode}`);
        node.iconPath = iconForFreePercent(element.entry.summaryRemainingPercent);
        children.push(node);
      }
      if (children.length === 0) {
        children.push(new QuotaNode("message", "No quota windows", element.entry, "Cached data is empty"));
      }
      return children;
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QuotaTreeProvider(context);
  context.subscriptions.push(provider, vscode.window.registerTreeDataProvider("omnirouteQuota.providers", provider));

  context.subscriptions.push(
    vscode.commands.registerCommand("omnirouteQuota.refresh", () => provider.refresh(true)),
    vscode.commands.registerCommand("omnirouteQuota.forceRefresh", () => provider.forceRefresh()),
    vscode.commands.registerCommand("omnirouteQuota.togglePercentMode", async () => {
      const next = percentMode() === "free" ? "used" : "free";
      await config().update("percentMode", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(`OmniRoute quota mode: ${next}`, 2500);
      await provider.refresh(false);
    }),
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
    vscode.commands.registerCommand("omnirouteQuota.hideProvider", async (node?: QuotaNode) => {
      const providerSlug = node?.labelText;
      if (!providerSlug) return;
      const hidden = new Set(config().get<string[]>("hiddenProviders") || []);
      hidden.add(providerSlug);
      await config().update("hiddenProviders", [...hidden].sort(), vscode.ConfigurationTarget.Global);
      await provider.refresh(true);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("omnirouteQuota")) {
        provider.resetTimer();
        void provider.refresh(false);
      }
    })
  );

  void provider.refresh(false);
}

export function deactivate(): void {}
