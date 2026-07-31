# OmniRoute Quota Tools

[English](./README.md) · **Русский** · [简体中文](./README.zh.md)

![Рабочий процесс квот OmniRoute](docs/assets/readme-hero.png)

CLI и боковая панель VS Code для просмотра квот провайдеров OmniRoute. Инструмент читает `/api/providers/client`, `/api/usage/provider-limits`, `/api/usage/quota` и умеет принудительно обновлять квоты через `POST /api/usage/provider-limits`.

## Быстрый старт

Для опубликованного CLI нужен Node.js 20 или новее. Установка и проверка одной командой:

```bash
npm install -g omniroute-quota-tools && omniroute-quota --help
```

Для локальной копии проекта:

```bash
npm ci && npm run build
```

Запрос локального OmniRoute без токена:

```bash
OMNIROUTE_BASE_URL=http://127.0.0.1:20128 omniroute-quota
```

Если включена авторизация, задайте `OMNIROUTE_API_KEY` или `OMNIROUTE_TOKEN` — токен должен иметь scope `manage`:

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

Также доступны `--base-url`, `--token` и `--auth-header` (`authorization`, `x-api-key` или `x-omniroute-cli-token`). JSON-режим подходит для автоматизации Claude Code. Переменные окружения: `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, `OMNIROUTE_TOKEN`, `OMNIROUTE_AUTH_HEADER`, `OMNIROUTE_HIDE_PROVIDERS`.

## Расширение VS Code

Соберите VSIX и установите его одной командой после `npm ci`:

```bash
npm run build && npm run package:vsix && code --install-extension omniroute-quota-tools-0.2.2.vsix
```

Откройте значок **OmniRoute Quota** на панели Activity Bar. Команды **Refresh**, **Refresh from Providers**, **Toggle Free/Used** и **Set API Token** доступны из заголовка панели или Command Palette. Токен рекомендуется сохранять через SecretStorage VS Code, а не в настройках.

Основные настройки: `omnirouteQuota.baseUrl`, `authHeader`, `hiddenProviders`, `autoRefreshIntervalSeconds`, `showOnlyQuotaProviders`, `percentMode` и `criticalThresholdPercent` (по умолчанию 15%). Поддерживаются окна квот `5h`, `weekly`, `monthly` и другие окна, возвращаемые OmniRoute.

## Безопасность и лицензия

Секреты не входят в расширение. CLI использует `OMNIROUTE_API_KEY`, `OMNIROUTE_TOKEN` или явный `--token`; расширение использует SecretStorage, настройки или переменные окружения. Лицензия — [MIT](./LICENSE).

Полное описание и пример команды Claude Code находятся в [README.md](./README.md).
