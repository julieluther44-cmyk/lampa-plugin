# Lampa Plugin - Streaming Platform

Плагин для Lampa, интегрирующий стриминг через нашу платформу.

## Возможности

- ✅ Кнопка "Смотреть онлайн" на карточках фильмов/сериалов
- ✅ Автоматический запрос к балансеру
- ✅ Failover на backup сервера при ошибках
- ✅ Настройка качества (2160p, 1080p, 720p, 480p)
- ✅ Анонимный user ID (генерируется автоматически)
- ✅ Поддержка автовоспроизведения
- ✅ Логирование в консоли (опционально)

## Установка

### Вариант 1: Установка через CUB (Community Plugins)

1. Открыть Lampa
2. Перейти в **Настройки** → **Плагины** → **CUB**
3. Добавить репозиторий плагина (когда будет опубликован)
4. Установить плагин "Streaming Platform"

### Вариант 2: Ручная установка (для разработки)

1. Скопировать файл `streaming-plugin.js`

2. **На Android TV/Mobile:**
   ```
   Lampa → Настройки → Плагины → Установить из файла
   → Выбрать streaming-plugin.js
   ```

3. **На Web версии Lampa:**
   ```javascript
   // Открыть консоль разработчика (F12)
   // Вставить код плагина и нажать Enter
   ```

4. **Через Extension (Chrome/Firefox):**
   - Создать UserScript в Tampermonkey/Greasemonkey
   - Вставить содержимое `streaming-plugin.js`
   - URL match: `*lampa.mx/*` или ваш домен Lampa

### Вариант 3: Через внешний скрипт

Добавить в HTML Lampa перед закрывающим тегом `</body>`:

```html
<script src="https://your-cdn.com/streaming-plugin.js"></script>
```

## Настройка

После установки перейти в:
```
Настройки → Streaming Platform
```

### Доступные настройки:

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| **Включено** | Вкл/Выкл плагин | ✅ Включено |
| **URL балансера** | Адрес API балансера | `http://localhost:8080` |
| **Предпочитаемое качество** | 2160p, 1080p, 720p, 480p | `1080p` |
| **Автовоспроизведение** | Автоматически начинать воспроизведение | ❌ Выключено |
| **Показывать логи** | Логи в консоли разработчика | ❌ Выключено |

## Использование

1. Открыть карточку фильма/сериала в Lampa
2. Нажать кнопку **"Смотреть онлайн"**
3. Плагин автоматически:
   - Отправит запрос к балансеру
   - Получит URL стрима
   - Откроет встроенный плеер Lampa
4. Если сервер недоступен, автоматически переключится на backup

## Как это работает

```
┌─────────────┐
│   Lampa     │
│  (Клиент)   │
└──────┬──────┘
       │ 1. Нажатие "Смотреть онлайн"
       ↓
┌──────────────────────────┐
│  streaming-plugin.js     │
│  - Получает IMDb ID      │
│  - Генерирует user_id    │
└──────┬───────────────────┘
       │ 2. POST /api/v1/content/play
       ↓
┌──────────────────────────┐
│     Balancer API         │
│  - Выбирает TorrServer   │
│  - Возвращает stream_url │
└──────┬───────────────────┘
       │ 3. HLS stream URL
       ↓
┌──────────────────────────┐
│   Lampa Player           │
│  - Воспроизведение HLS   │
│  - Failover на backup    │
└──────────────────────────┘
```

## API Request/Response

### Request (плагин → балансер)

```javascript
POST /api/v1/content/play
Content-Type: application/json

{
  "imdb_id": "tt0111161",
  "user_id": "user_abc123xyz",
  "quality_preference": "1080p"
}
```

### Response (балансер → плагин)

```javascript
{
  "torrserver_url": "https://ts-eu-central-01.example.com",
  "stream_url": "https://ts-eu-central-01.example.com/hls/tt0111161/master.m3u8",
  "stream_token": "eyJhbGciOiJIUzI1NiIs...",
  "backup_torrservers": [
    "https://ts-eu-central-02.example.com",
    "https://ts-eu-west-01.example.com"
  ],
  "estimated_start_time_seconds": 5
}
```

## Failover механизм

При ошибке воспроизведения (сервер недоступен, буферизация, и т.д.):

1. Плагин перехватывает событие `Player.error`
2. Автоматически переключается на первый backup сервер
3. Если backup тоже недоступен → следующий backup
4. После исчерпания всех backup → показать ошибку

## Отладка

### Включить логи

1. Настройки → Streaming Platform → **Показывать логи** → ✅
2. Открыть консоль разработчика (F12)
3. Фильтр: `[Streaming Platform]`

### Проверка работы балансера

```bash
curl -X POST http://localhost:8080/api/v1/content/play \
  -H "Content-Type: application/json" \
  -d '{"imdb_id":"tt0111161","user_id":"test","quality_preference":"1080p"}'
```

### Типичные проблемы

#### 1. Кнопка не появляется

**Причина**: IMDb ID не найден в карточке

**Решение**: Убедиться что в Lampa используется источник с IMDb ID (например, TMDB, IMDB)

#### 2. Ошибка "Failed to fetch"

**Причина**: CORS или балансер недоступен

**Решение**:
- Проверить что балансер запущен: `curl http://localhost:8080/health`
- Добавить CORS заголовки в балансер (см. ниже)

#### 3. Плеер не открывается

**Причина**: Неверный формат stream_url

**Решение**: Проверить что URL заканчивается на `.m3u8` (HLS playlist)

## CORS для балансера

Если балансер на другом домене, добавить middleware:

```go
// balancer/internal/api/routes.go

import "github.com/gin-contrib/cors"

func SetupRoutes(router *gin.Engine, ...) {
    // CORS middleware
    router.Use(cors.New(cors.Config{
        AllowOrigins:     []string{"*"}, // или конкретные домены Lampa
        AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
        AllowHeaders:     []string{"Origin", "Content-Type"},
        ExposeHeaders:    []string{"Content-Length"},
        AllowCredentials: true,
    }))

    // ... остальные routes
}
```

## Разработка

### Структура файла

```javascript
streaming-plugin.js
├── Конфигурация (PLUGIN_NAME, VERSION, DEFAULT_SETTINGS)
├── Утилиты (log, getUserID)
├── API (requestPlay)
├── Воспроизведение (playContent, setupPlayerErrorHandler)
├── UI (addWatchButton)
├── Инициализация (initialize, слушатели событий)
└── Настройки (createSettingsInterface)
```

### События Lampa

Плагин использует следующие события:

- `Lampa.Listener.follow('full')` - загрузка карточки контента
- `Lampa.Player.listener.follow('error')` - ошибка плеера (для failover)
- `Lampa.Player.listener.follow('start')` - начало воспроизведения
- `Lampa.Player.listener.follow('ended')` - конец воспроизведения
- `Lampa.Settings.listener.follow('open')` - открытие настроек

### Тестирование

1. **Локальное тестирование**:
   ```bash
   # Запустить балансер
   cd balancer
   docker-compose up -d

   # Запустить Lampa (web версия)
   # Загрузить плагин через консоль
   ```

2. **Создать тестовый контент**:
   ```bash
   curl -X POST http://localhost:8080/api/v1/admin/content \
     -H "Content-Type: application/json" \
     -d '{
       "imdb_id": "tt0111161",
       "title_original": "The Shawshank Redemption",
       "year": 1994,
       "type": "movie",
       "current_magnet": "magnet:?xt=urn:btih:test",
       "current_torrent_hash": "test123",
       "current_quality": "1080p",
       "current_bitrate_mbps": 10
     }'
   ```

## Roadmap

### v1.0 (MVP) ✅
- [x] Кнопка "Смотреть онлайн"
- [x] Интеграция с балансером
- [x] Failover на backup сервера
- [x] Настройки плагина

### v1.1
- [ ] Показ статуса загрузки (холодный/горячий старт)
- [ ] Progress bar при холодном старте
- [ ] Субтитры (OpenSubtitles API)
- [ ] Выбор аудиодорожки

### v1.2
- [ ] История просмотров
- [ ] Закладки/избранное
- [ ] Продолжить просмотр с позиции
- [ ] Статистика (что смотрели, сколько времени)

### v2.0
- [ ] Офлайн режим (локальное кэширование)
- [ ] P2P между пользователями (WebRTC)
- [ ] Синхронизация между устройствами
- [ ] Рекомендации на основе истории

## License

MIT

## Поддержка

- GitHub Issues: (ссылка на репозиторий)
- Telegram: (ссылка на группу)
