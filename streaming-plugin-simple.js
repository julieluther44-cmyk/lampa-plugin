(function() {
    'use strict';

    // Простейшая версия плагина для диагностики
    function init() {
        console.log('[Streaming Platform] Initializing...');

        if (!window.Lampa) {
            console.error('[Streaming Platform] Lampa not found!');
            return;
        }

        console.log('[Streaming Platform] Lampa found, starting plugin...');

        // Показываем уведомление что плагин загружен
        try {
            Lampa.Noty.show('Streaming Platform v1.0.0 loaded!');
            console.log('[Streaming Platform] Plugin loaded successfully');
        } catch (e) {
            console.error('[Streaming Platform] Error showing notification:', e);
        }

        // Добавляем кнопку на карточку фильма
        try {
            Lampa.Listener.follow('full', function(event) {
                if (event.type === 'complite') {
                    console.log('[Streaming Platform] Full card loaded');
                    console.log('[Streaming Platform] Event structure:', event);
                    console.log('[Streaming Platform] event.object:', event.object);
                    console.log('[Streaming Platform] event.object.activity:', event.object.activity);

                    setTimeout(function() {
                        try {
                            // Получаем компонент
                            var component = event.object.activity.component || event.object.component;
                            console.log('[Streaming Platform] Component:', component);

                            var card = event.data.movie;
                            console.log('[Streaming Platform] Card:', card);

                            // Ищем контейнер внутри HTML компонента
                            var componentHTML = component.html || $(component);
                            console.log('[Streaming Platform] Component HTML:', componentHTML);

                            var container = componentHTML.find('.full-start__buttons');
                            console.log('[Streaming Platform] Container found:', container.length);

                            if (container.length) {
                                var button = $('<div class="full-start__button selector view--online">')
                                    .html('<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="7" stroke="white"/><path d="M11 8.5L7 11V6L11 8.5Z" fill="white"/></svg><span>Смотреть онлайн</span>');

                                button.on('click', function() {
                                    Lampa.Noty.show('Кнопка работает! IMDb: ' + (card.imdb_id || 'not found'));
                                });

                                container.append(button);
                                console.log('[Streaming Platform] Button added successfully');
                            } else {
                                console.error('[Streaming Platform] Container .full-start__buttons not found');
                            }
                        } catch (e) {
                            console.error('[Streaming Platform] Error adding button:', e);
                        }
                    }, 500);
                }
            });
        } catch (e) {
            console.error('[Streaming Platform] Error setting up listener:', e);
        }
    }

    // Проверяем готовность Lampa
    if (window.Lampa) {
        init();
    } else {
        console.log('[Streaming Platform] Waiting for Lampa...');
        // Пробуем через небольшие интервалы
        var checkInterval = setInterval(function() {
            if (window.Lampa) {
                clearInterval(checkInterval);
                init();
            }
        }, 100);

        // Таймаут на случай если Lampa не загрузится
        setTimeout(function() {
            clearInterval(checkInterval);
            console.error('[Streaming Platform] Timeout waiting for Lampa');
        }, 10000);
    }
})();
