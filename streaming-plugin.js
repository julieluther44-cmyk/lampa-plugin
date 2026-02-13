(function() {
    'use strict';

    const PLUGIN_NAME = 'streaming-hls';
    const PLUGIN_VERSION = '2.0.0';

    // Настройки
    const DEFAULT_SETTINGS = {
        torrserver_url: 'http://178.20.46.93:8090',
        torrserver_auth: 'admin:90Cubg8RQAe24h',
        enabled: true,
        quality_preference: '720p',
        show_logs: true
    };

    let settings = DEFAULT_SETTINGS;

    function log(...args) {
        if (settings.show_logs) {
            console.log('[HLS Plugin]', ...args);
        }
    }

    function error(...args) {
        console.error('[HLS Plugin]', ...args);
    }

    // Base64 encode для авторизации
    function getAuthHeader() {
        if (settings.torrserver_auth) {
            return 'Basic ' + btoa(settings.torrserver_auth);
        }
        return null;
    }

    // API запрос к TorrServer
    async function torrserverRequest(endpoint, method = 'GET', body = null) {
        const url = settings.torrserver_url + endpoint;
        const headers = {
            'Content-Type': 'application/json'
        };

        const auth = getAuthHeader();
        if (auth) {
            headers['Authorization'] = auth;
        }

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        log('TorrServer request:', method, endpoint);
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`TorrServer error: ${response.status}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    // Получить список торрентов
    async function getTorrents() {
        return await torrserverRequest('/torrents', 'POST', { action: 'list' });
    }

    // Добавить торрент по magnet
    async function addTorrent(magnet, title) {
        return await torrserverRequest('/torrents', 'POST', {
            action: 'add',
            link: magnet,
            title: title,
            save_to_db: true
        });
    }

    // Загрузить торрент (получить info)
    async function loadTorrent(hash) {
        return await torrserverRequest('/torrents', 'POST', {
            action: 'get',
            hash: hash
        });
    }

    // Найти видео файл в торренте
    function findVideoFile(torrentData) {
        const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v'];
        let files = [];

        // Парсим file_stats из ответа
        if (torrentData.file_stats) {
            files = torrentData.file_stats;
        } else if (torrentData.data) {
            try {
                const data = JSON.parse(torrentData.data);
                if (data.TorrServer && data.TorrServer.Files) {
                    files = data.TorrServer.Files;
                }
            } catch (e) {
                log('Failed to parse torrent data:', e);
            }
        }

        // Находим самый большой видео файл
        let bestFile = null;
        let maxSize = 0;

        for (const file of files) {
            const path = file.path || '';
            const ext = path.substring(path.lastIndexOf('.')).toLowerCase();

            if (videoExtensions.includes(ext)) {
                const size = file.length || 0;
                if (size > maxSize) {
                    maxSize = size;
                    bestFile = file;
                }
            }
        }

        return bestFile;
    }

    // Получить HLS URL для файла
    function getHLSUrl(hash, fileId) {
        return `${settings.torrserver_url}/hls/${hash}/${fileId}/master.m3u8`;
    }

    // Показать диалог выбора торрента
    function showTorrentSelector(torrents, card, onSelect) {
        const items = torrents.map(t => ({
            title: t.title || t.name || 'Unknown',
            hash: t.hash,
            size: t.torrent_size ? formatSize(t.torrent_size) : '',
            subtitle: t.stat_string || ''
        }));

        Lampa.Select.show({
            title: 'Выберите торрент',
            items: items,
            onSelect: function(item) {
                onSelect(item.hash);
            },
            onBack: function() {
                Lampa.Controller.toggle('content');
            }
        });
    }

    // Форматирование размера
    function formatSize(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
        return bytes + ' B';
    }

    // Показать диалог добавления торрента
    function showAddTorrentDialog(card) {
        Lampa.Prompt.show({
            title: 'Добавить торрент',
            placeholder: 'Вставьте magnet ссылку',
            value: '',
            onEnter: function(magnet) {
                log('Magnet entered:', magnet);

                if (!magnet || !magnet.startsWith('magnet:')) {
                    Lampa.Noty.show('Неверная magnet ссылка');
                    return;
                }

                addTorrentAndPlay(magnet, card);
            },
            onBack: function() {
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
                // Даём время на загрузку info
                await new Promise(r => setTimeout(r, 2000));
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

    // Воспроизвести торрент по hash
    async function playTorrent(hash, card) {
        log('Playing torrent:', hash);

        Lampa.Loading.start();

        try {
            // Загружаем торрент
            const torrentData = await loadTorrent(hash);
            log('Torrent data:', torrentData);

            if (torrentData.stat_string === 'Torrent in db') {
                // Нужно активировать торрент
                log('Torrent in db, activating...');
                await new Promise(r => setTimeout(r, 1000));
                const activated = await loadTorrent(hash);
                log('Activated:', activated);
            }

            // Ждём пока торрент загрузит info
            let attempts = 0;
            let data = torrentData;

            while (attempts < 10 && (!data.file_stats || data.file_stats.length === 0)) {
                await new Promise(r => setTimeout(r, 1000));
                data = await loadTorrent(hash);
                attempts++;
                log('Waiting for torrent info, attempt:', attempts);
            }

            // Находим видео файл
            const videoFile = findVideoFile(data);

            if (!videoFile) {
                throw new Error('Видео файл не найден в торренте');
            }

            log('Video file found:', videoFile);

            // Формируем HLS URL
            const hlsUrl = getHLSUrl(hash, videoFile.id);
            log('HLS URL:', hlsUrl);

            Lampa.Loading.stop();

            // Воспроизводим
            Lampa.Player.play({
                url: hlsUrl,
                title: card.title || card.name || videoFile.path,
                quality: {},
                subtitles: []
            });

            Lampa.Player.playlist([{
                url: hlsUrl,
                title: card.title || card.name || videoFile.path
            }]);

        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка воспроизведения: ' + err.message);
            error('Play failed:', err);
        }
    }

    // Главная функция воспроизведения
    async function playContent(card) {
        log('Play content:', card);

        Lampa.Loading.start();

        try {
            // Получаем список торрентов
            const torrents = await getTorrents();
            log('Available torrents:', torrents);

            Lampa.Loading.stop();

            if (!torrents || torrents.length === 0) {
                // Нет торрентов - показываем диалог добавления
                showAddTorrentDialog(card);
                return;
            }

            // Показываем меню выбора
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

        const button = $('<div class="full-start__button selector view--online-hls">')
            .html('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg><span>HLS Стрим</span>');

        button.on('hover:enter', function() {
            playContent(card);
        });

        // Для клика мышью
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

        log('Initialized');
    }

    // Настройки плагина
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'hls_streaming',
            param: {
                name: 'torrserver_url',
                type: 'input',
                values: settings.torrserver_url,
                default: DEFAULT_SETTINGS.torrserver_url
            },
            field: {
                name: 'URL TorrServer',
                description: 'Адрес TorrServer с HLS'
            },
            onChange: function(value) {
                settings.torrserver_url = value;
                Lampa.Storage.set('hls_settings', settings);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'hls_streaming',
            param: {
                name: 'torrserver_auth',
                type: 'input',
                values: settings.torrserver_auth,
                default: ''
            },
            field: {
                name: 'Авторизация',
                description: 'user:password (если требуется)'
            },
            onChange: function(value) {
                settings.torrserver_auth = value;
                Lampa.Storage.set('hls_settings', settings);
            }
        });
    }

    // Запуск
    function startPlugin() {
        const saved = Lampa.Storage.get('hls_settings', {});
        settings = Object.assign({}, DEFAULT_SETTINGS, saved);

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'main') {
                setTimeout(addSettings, 10);
            }
        });

        initialize();
        Lampa.Noty.show('HLS Streaming v' + PLUGIN_VERSION);
        log('Started, TorrServer:', settings.torrserver_url);
    }

    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            if (window.Lampa) startPlugin();
        });
    }

})();
