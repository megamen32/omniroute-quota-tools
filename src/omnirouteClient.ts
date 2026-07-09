export type AuthHeaderMode = "authorization" | "x-api-key" | "x-omniroute-cli-token";

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  authHeader?: AuthHeaderMode;
  timeoutMs?: number;
}

export interface ProviderConnection {
  id: string;
  provider: string;
  name?: string;
  email?: string;
  authType?: string;
  isActive?: boolean;
  providerSpecificData?: Record<string, unknown>;
}

export interface QuotaWindow {
  key: string;
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetAt: string | null;
  exhausted: boolean | null;
  raw: unknown;
}

export interface ProviderQuotaEntry {
  connectionId: string;
  provider: string;
  name: string;
  email?: string;
  authType?: string;
  plan?: string | null;
  message?: string | null;
  fetchedAt?: string | null;
  windows: QuotaWindow[];
  summaryRemainingPercent: number | null;
  summaryResetAt: string | null;
  tokenStatus?: string | null;
  rawCache?: unknown;
}

export interface QuotaSnapshot {
  generatedAt: string;
  baseUrl: string;
  entries: ProviderQuotaEntry[];
  providerCount: number;
  connectionCount: number;
  hiddenProviders: string[];
}

const USAGE_SUPPORTED_PROVIDERS = new Set([
  "antigravity",
  "agy",
  "kiro",
  "amazon-q",
  "github",
  "codex",
  "claude",
  "cursor",
  "qoder",
  "kimi-coding",
  "kimi-coding-apikey",
  "glm",
  "glm-cn",
  "zai",
  "glmt",
  "opencode-go",
  "ollama-cloud",
  "minimax",
  "minimax-cn",
  "crof",
  "nanogpt",
  "deepseek",
  "xiaomi-mimo",
  "vertex",
  "vertex-partner",
  "codebuddy-cn",
]);

function cleanBaseUrl(input: string): string {
  const trimmed = (input || "").trim() || "http://127.0.0.1:20128";
  return trimmed.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function clampPercent(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(100, value));
}

function deriveRemainingPercent(q: Record<string, unknown>): number | null {
  const direct =
    asNumber(q.remaining_percentage) ??
    asNumber(q.remainingPercent) ??
    asNumber(q.percentRemaining) ??
    asNumber(q.remaining_pct) ??
    asNumber(q.percent_remaining);
  if (direct !== null) return clampPercent(direct);

  const percentage = asNumber(q.percentage);
  if (percentage !== null) return clampPercent(100 - percentage);

  const usedPercent = asNumber(q.used_percentage) ?? asNumber(q.usedPercent) ?? asNumber(q.percentUsed);
  if (usedPercent !== null) return clampPercent(100 - usedPercent);

  const total = asNumber(q.total) ?? asNumber(q.limit) ?? asNumber(q.quotaTotal) ?? asNumber(q.usage);
  const remaining = asNumber(q.remaining) ?? asNumber(q.available);
  const used = asNumber(q.used) ?? asNumber(q.currentValue) ?? asNumber(q.currentUsage) ?? asNumber(q.quotaUsed);
  if (total !== null && total > 0 && remaining !== null) return clampPercent((remaining / total) * 100);
  if (total !== null && total > 0 && used !== null) return clampPercent(100 - (used / total) * 100);
  return null;
}

function deriveUsedPercent(q: Record<string, unknown>, remaining: number | null): number | null {
  const direct = asNumber(q.used_percentage) ?? asNumber(q.usedPercent) ?? asNumber(q.percentUsed);
  if (direct !== null) return clampPercent(direct);
  const percentage = asNumber(q.percentage);
  if (percentage !== null) return clampPercent(percentage);
  return remaining === null ? null : clampPercent(100 - remaining);
}

function windowLabel(key: string, value: Record<string, unknown>): string {
  return asString(value.label) ?? asString(value.name) ?? key.replace(/[_-]+/g, " ");
}

function toQuotaWindow(key: string, value: unknown): QuotaWindow | null {
  const record = asRecord(value);
  if (!record) return null;
  const remainingPercent = deriveRemainingPercent(record);
  const usedPercent = deriveUsedPercent(record, remainingPercent);
  const exhausted =
    typeof record.is_exhausted === "boolean"
      ? record.is_exhausted
      : typeof record.isExhausted === "boolean"
        ? record.isExhausted
        : remainingPercent === null
          ? null
          : remainingPercent <= 0;
  return {
    key,
    label: windowLabel(key, record),
    remainingPercent,
    usedPercent,
    resetAt: asString(record.reset_at) ?? asString(record.resetAt) ?? asString(record.resetsAt),
    exhausted,
    raw: value,
  };
}

function parseQuotaWindows(cache: unknown): QuotaWindow[] {
  const root = asRecord(cache);
  if (!root) return [];

  const sources: Array<Record<string, unknown>> = [];
  const quotas = asRecord(root.quotas);
  if (quotas) sources.push(quotas);

  const data = asRecord(root.data);
  const dataQuotas = asRecord(data?.quotas);
  if (dataQuotas) sources.push(dataQuotas);

  const limits = Array.isArray(root.limits) ? root.limits : Array.isArray(data?.limits) ? data?.limits : null;
  if (limits) {
    const converted: Record<string, unknown> = {};
    limits.forEach((item, index) => {
      const record = asRecord(item);
      const key = asString(record?.type) ?? asString(record?.name) ?? `limit_${index + 1}`;
      converted[key] = item;
    });
    sources.push(converted);
  }

  const result: QuotaWindow[] = [];
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      const window = toQuotaWindow(key, value);
      if (window) result.push(window);
    }
  }

  const seen = new Set<string>();
  return result.filter((item) => {
    const dedupeKey = `${item.key}:${item.label}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

async function fetchJson<T>(path: string, options: ClientOptions & { method?: string } ): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.token) {
      if ((options.authHeader ?? "authorization") === "x-api-key") {
        headers["x-api-key"] = options.token;
      } else if ((options.authHeader ?? "authorization") === "x-omniroute-cli-token") {
        headers["x-omniroute-cli-token"] = options.token;
      } else {
        headers.Authorization = options.token.toLowerCase().startsWith("bearer ") ? options.token : `Bearer ${options.token}`;
      }
    }
    const response = await fetch(`${cleanBaseUrl(options.baseUrl)}${path}`, {
      method: options.method ?? "GET",
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${path}: ${text.slice(0, 500)}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshProviderCaches(options: ClientOptions): Promise<void> {
  await fetchJson<unknown>("/api/usage/provider-limits", { ...options, method: "POST", timeoutMs: options.timeoutMs ?? 120_000 });
}

export async function getQuotaSnapshot(
  options: ClientOptions,
  filters: { hiddenProviders?: string[]; showOnlyQuotaProviders?: boolean } = {}
): Promise<QuotaSnapshot> {
  const hidden = new Set((filters.hiddenProviders ?? []).map((x) => x.trim()).filter(Boolean));
  const [connectionsResponse, providerLimitsResponse, quotaSummaryResponse] = await Promise.all([
    fetchJson<{ connections?: ProviderConnection[] }>("/api/providers/client", options),
    fetchJson<{ caches?: Record<string, unknown> }>("/api/usage/provider-limits", options),
    fetchJson<{ providers?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>("/api/usage/quota", options).catch(() => ({ providers: [] })),
  ]);

  const connections = (connectionsResponse.connections ?? []).filter((connection) => {
    if (!connection?.id || !connection.provider) return false;
    if (hidden.has(connection.provider)) return false;
    if (connection.isActive === false) return false;
    if (filters.showOnlyQuotaProviders !== false && !USAGE_SUPPORTED_PROVIDERS.has(connection.provider)) return false;
    return true;
  });

  const caches = providerLimitsResponse.caches ?? {};
  const summaryByConnection = new Map<string, Record<string, unknown>>();
  for (const item of quotaSummaryResponse.providers ?? []) {
    const id = asString(item.connectionId);
    if (id) summaryByConnection.set(id, item);
  }

  const entries: ProviderQuotaEntry[] = connections
    .map((connection) => {
      const cache = caches[connection.id];
      const summary = summaryByConnection.get(connection.id) ?? null;
      const cacheRecord = asRecord(cache);
      const windows = parseQuotaWindows(cache);
      const summaryRemaining = clampPercent(asNumber(summary?.percentRemaining));
      return {
        connectionId: connection.id,
        provider: connection.provider,
        name: connection.name || connection.email || connection.provider,
        email: connection.email,
        authType: connection.authType,
        plan: asString(cacheRecord?.plan),
        message: asString(cacheRecord?.message),
        fetchedAt: asString(cacheRecord?.fetchedAt),
        windows,
        summaryRemainingPercent: summaryRemaining,
        summaryResetAt: asString(summary?.resetAt),
        tokenStatus: asString(summary?.tokenStatus),
        rawCache: cache,
      };
    })
    .filter((entry) => filters.showOnlyQuotaProviders === false || entry.windows.length > 0 || entry.summaryRemainingPercent !== null || entry.message)
    .sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.name.localeCompare(b.name);
    });

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: cleanBaseUrl(options.baseUrl),
    entries,
    providerCount: new Set(entries.map((entry) => entry.provider)).size,
    connectionCount: entries.length,
    hiddenProviders: [...hidden].sort(),
  };
}

export function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  if (value === 0 || value === 100) return `${value.toFixed(0)}%`;
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(0)}%`;
}

export function worstRemainingPercent(entry: ProviderQuotaEntry): number | null {
  const values = entry.windows.map((window) => window.remainingPercent).filter((value): value is number => value !== null);
  if (entry.summaryRemainingPercent !== null) values.push(entry.summaryRemainingPercent);
  if (values.length === 0) return null;
  return Math.min(...values);
}

