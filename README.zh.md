# OmniRoute Quota Tools

[English](./README.md) · [Русский](./README.ru.md) · **简体中文**

![OmniRoute 配额工作流](docs/assets/readme-hero.png)

用于查看 OmniRoute 供应商配额的 CLI 和 VS Code 侧边栏。工具读取 `/api/providers/client`、`/api/usage/provider-limits`、`/api/usage/quota`，并可通过 `POST /api/usage/provider-limits` 强制刷新。

## 快速开始

发布版 CLI 需要 Node.js 20 或更高版本。使用一条命令安装并检查：

```bash
npm install -g omniroute-quota-tools && omniroute-quota --help
```

在本地检出中安装锁定依赖并编译：

```bash
npm ci && npm run build
```

本地 OmniRoute（无认证）示例：

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128 omniroute-quota
```

如果服务需要认证，请设置具有 `manage` scope 的 `OMNIROUTE_API_KEY` 或 `OMNIROUTE_TOKEN`：

```bash
OMNIROUTE_BASE_URL=https://omniroute.example.com \
OMNIROUTE_API_KEY=oma_or_api_key_with_manage_scope \
omniroute-quota --refresh
```

## CLI

```bash
omniroute-quota --json --refresh
omniroute-quota --hide codex,github
omniroute-quota --show-all
```

还支持 `--base-url`、`--token` 和 `--auth-header`（`authorization`、`x-api-key` 或 `x-omniroute-cli-token`）。JSON 输出适合 Claude Code 自动化。环境变量包括 `OMNIROUTE_BASE_URL`、`OMNIROUTE_API_KEY`、`OMNIROUTE_TOKEN`、`OMNIROUTE_AUTH_HEADER` 和 `OMNIROUTE_HIDE_PROVIDERS`。

## VS Code 扩展

运行 `npm ci` 后，可以用一条命令构建 VSIX 并安装：

```bash
npm run build && npm run package:vsix && code --install-extension omniroute-quota-tools-0.2.2.vsix
```

打开 Activity Bar 中的 **OmniRoute Quota** 图标。**Refresh**、**Refresh from Providers**、**Toggle Free/Used** 和 **Set API Token** 可从面板标题栏或 Command Palette 使用。建议通过 VS Code SecretStorage 保存令牌，不要直接写入设置。

主要设置为 `omnirouteQuota.baseUrl`、`authHeader`、`hiddenProviders`、`autoRefreshIntervalSeconds`、`showOnlyQuotaProviders`、`percentMode` 和 `criticalThresholdPercent`（默认 15%）。支持 `5h`、`weekly`、`monthly` 等 OmniRoute 返回的配额窗口。

## 安全与许可证

扩展不会打包密钥。CLI 使用 `OMNIROUTE_API_KEY`、`OMNIROUTE_TOKEN` 或显式的 `--token`；扩展使用 SecretStorage、设置或环境变量。许可证为 [MIT](./LICENSE)。

完整说明和 Claude Code 命令示例见 [README.md](./README.md)。
