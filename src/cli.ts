#!/usr/bin/env node
import { getQuotaSnapshot, refreshProviderCaches, formatPercent, worstRemainingPercent } from "./omnirouteClient";

interface Args {
  baseUrl: string;
  token?: string;
  authHeader: "authorization" | "x-api-key" | "x-omniroute-cli-token";
  hiddenProviders: string[];
  json: boolean;
  refresh: boolean;
  showAll: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    baseUrl: process.env.OMNIROUTE_BASE_URL || process.env.ANTHROPIC_BASE_URL || "http://127.0.0.1:20128",
    token: process.env.OMNIROUTE_API_KEY || process.env.OMNIROUTE_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN,
    authHeader: (process.env.OMNIROUTE_AUTH_HEADER as "authorization" | "x-api-key" | "x-omniroute-cli-token") || "authorization",
    hiddenProviders: (process.env.OMNIROUTE_HIDE_PROVIDERS || "").split(",").map((x) => x.trim()).filter(Boolean),
    json: false,
    refresh: false,
    showAll: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--base-url") args.baseUrl = next();
    else if (arg === "--token") args.token = next();
    else if (arg === "--auth-header") {
      const value = next();
      args.authHeader = value === "x-api-key" || value === "x-omniroute-cli-token" ? value : "authorization";
    }
    else if (arg === "--hide") args.hiddenProviders.push(...next().split(",").map((x) => x.trim()).filter(Boolean));
    else if (arg === "--json") args.json = true;
    else if (arg === "--refresh") args.refresh = true;
    else if (arg === "--show-all") args.showAll = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`omniroute-quota

Usage:
  omniroute-quota [--base-url URL] [--token TOKEN] [--json] [--refresh]

Environment:
  OMNIROUTE_BASE_URL      OmniRoute base URL, default http://127.0.0.1:20128
  OMNIROUTE_API_KEY       API key/access token with manage scope
  OMNIROUTE_AUTH_HEADER   authorization, x-api-key, or x-omniroute-cli-token
  OMNIROUTE_HIDE_PROVIDERS comma-separated provider slugs to hide

Options:
  --refresh               POST /api/usage/provider-limits before reading cached quotas
  --json                  Print raw normalized JSON
  --show-all              Include providers without quota data
  --hide a,b              Hide provider slugs
`);
}

function compact(text: string | undefined | null, width: number): string {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (value.length <= width) return value.padEnd(width, " ");
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function printTable(snapshot: Awaited<ReturnType<typeof getQuotaSnapshot>>): void {
  console.log(`OmniRoute quota @ ${snapshot.baseUrl}`);
  console.log(`Generated: ${snapshot.generatedAt}`);
  console.log(`Providers: ${snapshot.providerCount}, connections: ${snapshot.connectionCount}`);
  if (snapshot.hiddenProviders.length) console.log(`Hidden: ${snapshot.hiddenProviders.join(", ")}`);
  console.log("");
  console.log(`${"Provider".padEnd(16)} ${"Account".padEnd(30)} ${"Worst left".padEnd(10)} Windows / notes`);
  console.log(`${"-".repeat(16)} ${"-".repeat(30)} ${"-".repeat(10)} ${"-".repeat(60)}`);
  for (const entry of snapshot.entries) {
    const worst = formatPercent(worstRemainingPercent(entry));
    const windows = entry.windows.length
      ? entry.windows.map((w) => `${w.label}: ${formatPercent(w.remainingPercent)} left${w.resetAt ? ` reset ${w.resetAt}` : ""}`).join("; ")
      : entry.message || (entry.summaryRemainingPercent !== null ? `summary: ${formatPercent(entry.summaryRemainingPercent)} left` : "no quota data");
    console.log(`${compact(entry.provider, 16)} ${compact(entry.name, 30)} ${worst.padEnd(10)} ${windows}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.refresh) {
    await refreshProviderCaches({ baseUrl: args.baseUrl, token: args.token, authHeader: args.authHeader });
  }
  const snapshot = await getQuotaSnapshot(
    { baseUrl: args.baseUrl, token: args.token, authHeader: args.authHeader },
    { hiddenProviders: args.hiddenProviders, showOnlyQuotaProviders: !args.showAll }
  );
  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  printTable(snapshot);
}

main().catch((error) => {
  console.error(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
