(function() {
    'use strict';

    const PLUGIN_NAME = 'streaming-orchestrator';
    const PLUGIN_VERSION = '3.0.0';

    // Текущая сессия orchestrator
    let currentSession = null;
    let positionSaveInterval = null;

    // Настройки
    const DEFAULT_SETTINGS = {
        orchestrator_url: 'http://178.20.46.93:8091',
        enabled: true,
        quality_preference: '1080p',
        show_logs: true
    };

    let settings = DEFAULT_SETTINGS;

    function log(...args) {
        if (settings.show_logs) {
            console.log('[Orchestrator]', ...args);
        }
    }

    function error(...args) {
        console.error('[Orchestrator]', ...args);
    }

    // === Сохранение позиции воспроизведения ===

    function getPositionKey(hash, fileId) {
        return 'orch_position_' + hash + '_' + fileId;
    }

    function savePosition(hash, fileId, position) {
        if (position > 10) {
            const key = getPositionKey(hash, fileId);
            const data = {
                position: position,
                timestamp: Date.now()
            };
            Lampa.Storage.set(key, data);
            log('Position saved:', position);
        }
    }

    function loadPosition(hash, fileId) {
        const key = getPositionKey(hash, fileId);
        const data = Lampa.Storage.get(key, null);
        if (data && data.position) {
            const maxAge = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - data.timestamp < maxAge) {
                log('Position loaded:', data.position);
                return data.position;
            }
        }
        return 0;
    }

    function startPositionTracking(hash, fileId) {
        stopPositionTracking();

        positionSaveInterval = setInterval(function() {
            try {
                const player = Lampa.Player.video();
                if (player && player.currentTime) {
                    savePosition(hash, fileId, player.currentTime);
                }
            } catch (e) {
                log('Error saving position:', e);
            }
        }, 5000);

        log('Position tracking started');
    }

    function stopPositionTracking() {
        if (positionSaveInterval) {
            clearInterval(positionSaveInterval);
            positionSaveInterval = null;
        }

        // Сохраняем финальную позицию
        if (currentSession) {
            try {
                const player = Lampa.Player.video();
                if (player && player.currentTime) {
                    savePosition(currentSession.hash, currentSession.fileId, player.currentTime);
                }
            } catch (e) {
                log('Error saving final position:', e);
            }
        }

        log('Position tracking stopped');
    }

    // API запрос к Orchestrator
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const url = settings.orchestrator_url + endpoint;
        const headers = {
            'Content-Type': 'application/json'
        };

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        log('API request:', method, url);
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    // === Orchestrator API ===

    // Создать сессию (orchestrator добавит торрент если нужно)
    async function createSession(torrentHash, fileId) {
        return await apiRequest('/orchestrator/session', 'POST', {
            torrent_hash: torrentHash,
            file_id: fileId
        });
    }

    // Запустить сессию (FFmpeg)
    async function startSession(sessionId, quality) {
        return await apiRequest(`/orchestrator/session/${sessionId}/start`, 'POST', {
            quality: quality || settings.quality_preference
        });
    }

    // Остановить сессию
    async function stopSession(sessionId) {
        try {
            return await apiRequest(`/orchestrator/session/${sessionId}`, 'DELETE');
        } catch (e) {
            log('Error stopping session:', e);
        }
    }

    // Получить статистику
    async function getStats() {
        return await apiRequest('/orchestrator/stats', 'GET');
    }

    // Получить список торрентов
    async function getTorrents() {
        return await apiRequest('/orchestrator/torrents', 'GET');
    }

    // Добавить торрент
    async function addTorrent(magnet, title, poster) {
        return await apiRequest('/orchestrator/torrents', 'POST', {
            magnet: magnet,
            title: title,
            poster: poster
        });
    }

    // Получить файлы торрента
    async function getTorrentFiles(hash) {
        return await apiRequest(`/orchestrator/torrents/${hash}/files`, 'GET');
    }


    // Найти видео файл в списке файлов
    function findVideoFileFromList(files) {
        const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v'];

        if (!files || !Array.isArray(files)) {
            return null;
        }

        let bestFile = null;
        let maxSize = 0;

        for (const file of files) {
            const path = file.path || file.name || '';
            const ext = path.substring(path.lastIndexOf('.')).toLowerCase();

            if (videoExtensions.includes(ext)) {
                const size = file.length || file.size || 0;
                if (size > maxSize) {
                    maxSize = size;
                    bestFile = file;
                }
            }
        }

        return bestFile;
    }

    // Форматирование
    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
        return bytes + ' B';
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
        return m + ':' + String(s).padStart(2, '0');
    }

    // Показать диалог добавления торрента
    function showAddTorrentDialog(card) {
        var modal = $('<div class="modal modal--input"><div class="modal__content"><div class="modal__head"><div class="modal__title">Добавить торрент</div></div><div class="modal__body"><div class="modal__descr">Вставьте magnet ссылку:</div><input type="text" class="modal__input" placeholder="magnet:?xt=urn:btih:..." style="width:100%;padding:10px;margin:10px 0;background:#333;border:1px solid #555;color:#fff;border-radius:5px;font-size:14px;"></div><div class="modal__footer"><div class="modal__buttons"><div class="modal__button modal__button--add selector">Добавить</div><div class="modal__button modal__button--cancel selector">Отмена</div></div></div></div></div>');

        $('body').append(modal);

        var input = modal.find('.modal__input');
        input.focus();

        function closeModal() {
            modal.remove();
            $(document).off('keydown.modalinput');
        }

        modal.find('.modal__button--add').on('click', function() {
            var magnet = input.val().trim();
            closeModal();

            if (!magnet || !magnet.startsWith('magnet:')) {
                Lampa.Noty.show('Неверная magnet ссылка');
                return;
            }

            addTorrentAndPlay(magnet, card);
        });

        modal.find('.modal__button--cancel').on('click', function() {
            closeModal();
            Lampa.Controller.toggle('content');
        });

        input.on('keypress', function(e) {
            if (e.which === 13) {
                modal.find('.modal__button--add').click();
            }
        });

        input.on('keydown', function(e) {
            e.stopPropagation();
        });

        $(document).on('keydown.modalinput', function(e) {
            if (e.which === 27) {
                closeModal();
                Lampa.Controller.toggle('content');
            }
        });
    }

    // Добавить торрент и воспроизвести
    async function addTorrentAndPlay(magnet, card) {
        Lampa.Loading.start();

        try {
            const title = card.title || card.name || 'Unknown';
            log('Adding torrent:', magnet);

            const result = await addTorrent(magnet, title);
            log('Torrent added:', result);

            if (result && result.hash) {
                await new Promise(r => setTimeout(r, 2000));
                Lampa.Loading.stop();
                await playTorrent(result.hash, card);
            } else {
                throw new Error('No hash in response');
            }
        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка: ' + err.message);
            error('Add torrent failed:', err);
        }
    }

    // Показать выбор качества
    function showQualitySelector(hash, fileId, card, savedPosition) {
        const qualities = [
            { title: '1080p (без транскодирования)', value: '1080p', subtitle: 'Оригинальное качество' },
            { title: '720p', value: '720p', subtitle: 'Транскодирование' },
            { title: '480p', value: '480p', subtitle: 'Низкое качество' }
        ];

        Lampa.Select.show({
            title: 'Выберите качество',
            items: qualities,
            onSelect: async function(item) {
                await startPlayback(hash, fileId, item.value, card, savedPosition);
            },
            onBack: function() {
                Lampa.Controller.toggle('content');
            }
        });
    }

    // Запустить воспроизведение через Orchestrator
    async function startPlayback(hash, fileId, quality, card, savedPosition) {
        Lampa.Loading.start();

        try {
            // 1. Создаём сессию
            log('Creating session for', hash, 'file', fileId);
            const session = await createSession(hash, fileId);
            log('Session created:', session);

            if (!session || !session.session_id) {
                throw new Error('Failed to create session');
            }

            // 2. Запускаем FFmpeg
            log('Starting session with quality:', quality);
            const startResult = await startSession(session.session_id, quality);
            log('Session started:', startResult);

            // 3. Даём время FFmpeg создать первые сегменты
            Lampa.Noty.show('Подготовка видео...');
            await new Promise(r => setTimeout(r, 3000));

            // 4. Формируем HLS URL
            const hlsUrl = `${settings.orchestrator_url}/orchestrator/${session.session_id}/master.m3u8`;
            log('HLS URL:', hlsUrl);

            // Сохраняем текущую сессию
            currentSession = {
                sessionId: session.session_id,
                hash: hash,
                fileId: fileId,
                quality: quality
            };

            Lampa.Loading.stop();

            // 5. Воспроизводим
            Lampa.Player.play({
                url: hlsUrl,
                title: card.title || card.name || 'Video',
                quality: {},
                subtitles: []
            });

            Lampa.Player.playlist([{
                url: hlsUrl,
                title: card.title || card.name || 'Video'
            }]);

            // Начинаем отслеживание позиции
            startPositionTracking(hash, fileId);

            // Перемотка на сохранённую позицию
            if (savedPosition > 0) {
                log('Will seek to saved position:', savedPosition);

                let attempts = 0;
                const maxAttempts = 15;
                const seekInterval = setInterval(function() {
                    attempts++;
                    try {
                        const player = Lampa.Player.video();
                        if (player && player.readyState >= 2) {
                            log('Seeking to position:', savedPosition);
                            player.currentTime = savedPosition;
                            Lampa.Noty.show('Продолжение с ' + formatTime(savedPosition));
                            clearInterval(seekInterval);
                        }
                    } catch (e) {
                        log('Seek attempt failed:', e);
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(seekInterval);
                        log('Failed to seek after', maxAttempts, 'attempts');
                    }
                }, 1000);
            }

        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка: ' + err.message);
            error('Playback failed:', err);
        }
    }

    // Воспроизвести торрент
    async function playTorrent(hash, card) {
        log('Playing torrent:', hash);

        Lampa.Loading.start();

        try {
            // Загружаем файлы торрента через orchestrator
            let files = await getTorrentFiles(hash);
            log('Torrent files:', files);

            // Ждём пока торрент загрузит info
            let attempts = 0;
            while (attempts < 10 && (!files || files.length === 0)) {
                await new Promise(r => setTimeout(r, 1000));
                files = await getTorrentFiles(hash);
                attempts++;
                log('Waiting for torrent info, attempt:', attempts);
            }

            // Находим видео файл
            const videoFile = findVideoFileFromList(files);

            if (!videoFile) {
                throw new Error('Видео файл не найден в торренте');
            }

            log('Video file found:', videoFile);

            // Загружаем сохранённую позицию
            const savedPosition = loadPosition(hash, videoFile.id);

            Lampa.Loading.stop();

            // Показываем выбор качества
            showQualitySelector(hash, videoFile.id, card, savedPosition);

        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка: ' + err.message);
            error('Play failed:', err);
        }
    }

    // Очистка сессии при выходе
    async function cleanupSession() {
        if (currentSession) {
            log('Cleaning up session:', currentSession.sessionId);
            await stopSession(currentSession.sessionId);
            currentSession = null;
        }
    }

    // Главная функция воспроизведения
    async function playContent(card) {
        log('Play content:', card);

        // Очищаем предыдущую сессию
        await cleanupSession();

        Lampa.Loading.start();

        try {
            const torrents = await getTorrents();
            log('Available torrents:', torrents);

            Lampa.Loading.stop();

            if (!torrents || torrents.length === 0) {
                showAddTorrentDialog(card);
                return;
            }

            const items = [
                {
                    title: '➕ Добавить новый торрент',
                    action: 'add'
                },
                ...torrents.map(t => ({
                    title: t.title || t.name || 'Unknown',
                    subtitle: formatSize(t.torrent_size || 0) + ' • ' + (t.stat_string || ''),
                    hash: t.hash,
                    action: 'play'
                }))
            ];

            Lampa.Select.show({
                title: 'Выберите источник',
                items: items,
                onSelect: async function(item) {
                    if (item.action === 'add') {
                        showAddTorrentDialog(card);
                    } else {
                        await playTorrent(item.hash, card);
                    }
                },
                onBack: function() {
                    Lampa.Controller.toggle('content');
                }
            });

        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка: ' + err.message);
            error('Failed:', err);
        }
    }

    // Добавить кнопку на карточку
    function addWatchButton(component, card) {
        if (!settings.enabled) return;

        const button = $('<div class="full-start__button selector view--online-orch">')
            .html('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg><span>Смотреть</span>');

        button.on('hover:enter', function() {
            playContent(card);
        });

        button.on('click', function() {
            playContent(card);
        });

        let container = component.find('.full-start-new__buttons');
        if (!container.length) {
            container = component.find('.full-start__buttons');
        }

        if (container.length) {
            container.append(button);
            log('Button added');
        }
    }

    // Инициализация
    function initialize() {
        log('Initializing...');

        Lampa.Listener.follow('full', function(event) {
            if (event.type === 'complite') {
                const card = event.data.movie;
                const component = event.object.activity.component;

                setTimeout(function() {
                    const html = component.html ? $(component.html) : $(component);
                    addWatchButton(html, card);
                }, 300);
            }
        });

        // Очистка при закрытии плеера
        Lampa.Listener.follow('player', function(event) {
            if (event.type === 'destroy' || event.type === 'exit') {
                log('Player closed');
                stopPositionTracking();
                cleanupSession();
            }
        });

        log('Initialized');
    }

    // Настройки
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'orchestrator_streaming',
            param: {
                name: 'orchestrator_url',
                type: 'input',
                values: settings.orchestrator_url,
                default: DEFAULT_SETTINGS.orchestrator_url
            },
            field: {
                name: 'URL Orchestrator',
                description: 'Адрес сервера Orchestrator (порт 8091)'
            },
            onChange: function(value) {
                settings.orchestrator_url = value;
                Lampa.Storage.set('orch_settings', settings);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'orchestrator_streaming',
            param: {
                name: 'quality_preference',
                type: 'select',
                values: {
                    '1080p': '1080p (без транскодирования)',
                    '720p': '720p',
                    '480p': '480p'
                },
                default: '1080p'
            },
            field: {
                name: 'Качество по умолчанию',
                description: 'Предпочтительное качество видео'
            },
            onChange: function(value) {
                settings.quality_preference = value;
                Lampa.Storage.set('orch_settings', settings);
            }
        });
    }

    // Запуск
    function startPlugin() {
        const saved = Lampa.Storage.get('orch_settings', {});
        settings = Object.assign({}, DEFAULT_SETTINGS, saved);

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'main') {
                setTimeout(addSettings, 10);
            }
        });

        initialize();
        Lampa.Noty.show('Orchestrator v' + PLUGIN_VERSION);
        log('Started, Orchestrator URL:', settings.orchestrator_url);
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            if (window.Lampa) startPlugin();
        });
    }

})();
