# Установка плагина на GitHub Pages

## Шаг 1: Создать репозиторий на GitHub

1. Перейди на https://github.com/new
2. Название репозитория: **lampa-plugin**
3. Описание: **Streaming Platform plugin for Lampa**
4. Visibility: **Public** (обязательно для GitHub Pages!)
5. ❌ НЕ СОЗДАВАТЬ README, .gitignore или LICENSE (они уже есть локально)
6. Нажми **Create repository**

## Шаг 2: Запушить код

После создания репозитория GitHub покажет инструкции. Выполни команды:

```bash
cd "C:\Users\Administrator\desktop\stream\lampa-plugin-github"

# Добавить remote (ЗАМЕНИ YOUR_USERNAME на свой!)
git remote add origin https://github.com/YOUR_USERNAME/lampa-plugin.git

# Переименовать ветку в main (если нужно)
git branch -M main

# Запушить код
git push -u origin main
```

**Важно:** При первом push GitHub попросит авторизацию:
- Username: твой GitHub username
- Password: использовать **Personal Access Token** (не пароль!)

### Создать Personal Access Token:

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Название: **lampa-plugin-upload**
4. Expiration: **90 days**
5. Права: поставить галочку **repo** (все подпункты)
6. Generate token
7. **СКОПИРУЙ ТОКЕН СРАЗУ** (больше не покажется!)
8. Используй токен вместо пароля при git push

## Шаг 3: Включить GitHub Pages

1. В репозитории перейди: **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: выбери **main** и папку **/ (root)**
4. Нажми **Save**

GitHub начнёт деплой (займёт 1-2 минуты).

## Шаг 4: Обновить URLs в manifest.json

После включения Pages, твой сайт будет доступен по адресу:
```
https://YOUR_USERNAME.github.io/lampa-plugin/
```

Замени `YOUR_GITHUB_USERNAME` в файле `manifest.json` на свой реальный username:

```bash
cd "C:\Users\Administrator\desktop\stream\lampa-plugin-github"

# Открой manifest.json и замени:
# YOUR_GITHUB_USERNAME → твой_username

# Commit изменения
git add manifest.json
git commit -m "Update manifest URLs"
git push
```

## Шаг 5: Проверить что всё работает

1. Проверь что манифест доступен:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/lampa-plugin/main/manifest.json
   ```

2. Проверь что плагин доступен:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/lampa-plugin/main/streaming-plugin.js
   ```

Оба URL должны открываться в браузере.

## Шаг 6: Установить в Lampa

1. Открой **Lampa** (https://lampa.mx)
2. Настройки → Расширения → Плагины
3. "Установить из репозитория"
4. Введи URL:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/lampa-plugin/main/manifest.json
   ```
5. Нажми "Установить"

Теперь плагин должен установиться успешно! ✅

---

## Troubleshooting

### Ошибка авторизации при git push

Если получаешь ошибку "Authentication failed":
1. Убедись что используешь **Personal Access Token**, а не пароль
2. Проверь что токену дали права **repo**
3. Попробуй использовать SSH вместо HTTPS (настроить SSH ключи)

### GitHub Pages не активируется

- Репозиторий должен быть **Public**
- Проверь что выбрана ветка **main** и папка **/ (root)**
- Подожди 2-3 минуты после активации

### Плагин не устанавливается в Lampa

- Проверь что манифест доступен по URL (открой в браузере)
- Проверь что в manifest.json правильные URL (без `YOUR_USERNAME`)
- Подожди 5-10 минут после git push (GitHub кэширует файлы)

---

**Готово!** После выполнения всех шагов плагин будет доступен через HTTPS и успешно установится в Lampa.
