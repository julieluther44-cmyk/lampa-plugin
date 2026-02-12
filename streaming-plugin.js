(function() {
    'use strict';

    // Конфигурация плагина
    const PLUGIN_NAME = 'streaming-platform';
    const PLUGIN_VERSION = '1.0.0';

    // Настройки по умолчанию
    const DEFAULT_SETTINGS = {
        balancer_url: 'http://localhost:8080',
        enabled: true,
        quality_preference: '1080p',
        auto_play: false,
        show_logs: false
    };

    let settings = DEFAULT_SETTINGS;

    // Логирование
    function log(...args) {
        if (settings.show_logs) {
            console.log('[Streaming Platform]', ...args);
        }
    }

    function error(...args) {
        console.error('[Streaming Platform]', ...args);
    }

    // Генерация анонимного user ID
    function getUserID() {
        let userID = Lampa.Storage.get('streaming_user_id');
        if (!userID) {
            userID = 'user_' + Math.random().toString(36).substring(2, 15);
            Lampa.Storage.set('streaming_user_id', userID);
        }
        return userID;
    }

    // API запрос к балансеру
    async function requestPlay(imdbID) {
        log('Requesting play for IMDb ID:', imdbID);

        const url = `${settings.balancer_url}/api/v1/content/play`;
        const payload = {
            imdb_id: imdbID,
            user_id: getUserID(),
            quality_preference: settings.quality_preference
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            log('Play response:', data);
            return data;

        } catch (err) {
            error('Failed to request play:', err);
            throw err;
        }
    }

    // Воспроизведение контента
    async function playContent(card) {
        log('Play content called for card:', card);

        // Получить IMDb ID из карточки
        const imdbID = card.imdb_id || (card.source && card.source.imdb_id);

        if (!imdbID) {
            Lampa.Noty.show('Ошибка: IMDb ID не найден');
            return;
        }

        // Показать загрузку
        Lampa.Loading.start();

        try {
            // Запросить URL стрима у балансера
            const playData = await requestPlay(imdbID);

            Lampa.Loading.stop();

            // Подготовить данные для плеера
            const videoData = {
                url: playData.stream_url,
                title: card.title || card.name || 'Streaming',
                quality: playData.quality || settings.quality_preference,
                subtitles: [],
                callback: function() {
                    log('Player closed');
                }
            };

            log('Opening player with URL:', videoData.url);

            // Открыть плеер Lampa
            Lampa.Player.play(videoData);

            // Настроить обработчик ошибок для failover
            setupPlayerErrorHandler(playData);

        } catch (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка загрузки: ' + err.message);
            error('Play failed:', err);
        }
    }

    // Настроить failover на backup сервера
    function setupPlayerErrorHandler(playData) {
        let failoverAttempts = 0;
        const maxAttempts = playData.backup_torrservers ? playData.backup_torrservers.length : 0;

        Lampa.Player.listener.follow('error', function(event) {
            log('Player error detected, attempting failover...', event);

            if (failoverAttempts >= maxAttempts) {
                error('All backup servers failed');
                Lampa.Noty.show('Ошибка: все сервера недоступны');
                return;
            }

            const backupURL = playData.backup_torrservers[failoverAttempts];
            const imdbID = playData.stream_url.match(/hls\/([^\/]+)\//)[1];
            const newStreamURL = `${backupURL}/hls/${imdbID}/master.m3u8`;

            log('Switching to backup server:', newStreamURL);

            Lampa.Player.play({
                url: newStreamURL,
                title: 'Streaming (backup server)',
                subtitles: []
            });

            failoverAttempts++;
        });
    }

    // Добавить кнопку "Смотреть онлайн" к карточке
    function addWatchButton(component, card) {
        if (!settings.enabled) return;

        log('Adding watch button to card');

        // Создать кнопку
        const button = $('<div class="full-start__button selector view--online">')
            .html('<svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 15.5C12.366 15.5 15.5 12.366 15.5 8.5C15.5 4.63401 12.366 1.5 8.5 1.5C4.63401 1.5 1.5 4.63401 1.5 8.5C1.5 12.366 4.63401 15.5 8.5 15.5Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 8.5L7.5 11V6L11.5 8.5Z" fill="white"/></svg><span>Смотреть онлайн</span>');

        // Обработчик клика
        button.on('click', function() {
            playContent(card);
        });

        // Найти контейнер для кнопок (новая версия Lampa использует full-start-new__buttons)
        let buttonsContainer = component.find('.full-start-new__buttons');

        // Fallback для старых версий Lampa
        if (!buttonsContainer.length) {
            buttonsContainer = component.find('.full-start__buttons');
        }

        if (buttonsContainer.length) {
            buttonsContainer.append(button);
            log('Button added successfully');
        } else {
            error('Buttons container not found');
        }
    }

    // Инициализация: слушать события Lampa
    function initialize() {
        log('Plugin initializing...');

        // Слушать событие полной загрузки карточки фильма/сериала
        Lampa.Listener.follow('full', function(event) {
            if (event.type === 'complite') {
                log('Full card loaded:', event.data);

                const card = event.data.movie;
                const component = event.object.activity.component;

                // Добавить кнопку после небольшой задержки (чтобы DOM успел обновиться)
                setTimeout(function() {
                    // Получить HTML компонента
                    const componentHTML = component.html ? $(component.html) : $(component);
                    addWatchButton(componentHTML, card);
                }, 500);
            }
        });

        // Слушать события плеера для логирования
        Lampa.Player.listener.follow('start', function() {
            log('Player started');
        });

        Lampa.Player.listener.follow('ended', function() {
            log('Player ended');
        });

        log('Plugin initialized successfully');
    }

    // Настройки плагина
    function createSettingsInterface() {
        return {
            component: 'streaming_platform',
            name: 'Streaming Platform',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M15 12L10 15V9L15 12Z" fill="white"/></svg>',
            items: [
                {
                    name: 'Включено',
                    type: 'toggle',
                    value: settings.enabled,
                    onChange: function(value) {
                        settings.enabled = value;
                        saveSettings();
                    }
                },
                {
                    name: 'URL балансера',
                    type: 'input',
                    value: settings.balancer_url,
                    placeholder: 'http://localhost:8080',
                    onChange: function(value) {
                        settings.balancer_url = value;
                        saveSettings();
                    }
                },
                {
                    name: 'Предпочитаемое качество',
                    type: 'select',
                    value: settings.quality_preference,
                    values: ['2160p', '1080p', '720p', '480p'],
                    onChange: function(value) {
                        settings.quality_preference = value;
                        saveSettings();
                    }
                },
                {
                    name: 'Автовоспроизведение',
                    type: 'toggle',
                    value: settings.auto_play,
                    onChange: function(value) {
                        settings.auto_play = value;
                        saveSettings();
                    }
                },
                {
                    name: 'Показывать логи в консоли',
                    type: 'toggle',
                    value: settings.show_logs,
                    onChange: function(value) {
                        settings.show_logs = value;
                        saveSettings();
                    }
                }
            ]
        };
    }

    function saveSettings() {
        Lampa.Storage.set('streaming_platform_settings', settings);
        log('Settings saved:', settings);
    }

    // Регистрация плагина в Lampa
    function startPlugin() {
        // Загрузить настройки из хранилища
        settings = Lampa.Storage.get('streaming_platform_settings', DEFAULT_SETTINGS);

        // Добавить раздел настроек
        Lampa.Settings.listener.follow('open', function(event) {
            if (event.name === 'main') {
                Lampa.SettingsApi.addComponent(createSettingsInterface());
            }
        });

        // Инициализировать основную функциональность
        initialize();

        // Показать уведомление об успешной загрузке
        Lampa.Noty.show(`Streaming Platform v${PLUGIN_VERSION} загружен`);
        log(`Plugin v${PLUGIN_VERSION} started successfully`);
    }

    // Точка входа
    if (window.Lampa) {
        startPlugin();
    } else {
        // Если Lampa еще не загружена, ждем
        document.addEventListener('DOMContentLoaded', function() {
            if (window.Lampa) {
                startPlugin();
            } else {
                error('Lampa not found');
            }
        });
    }

})();
