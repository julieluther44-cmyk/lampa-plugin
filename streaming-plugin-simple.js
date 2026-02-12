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

                            // Получаем HTML компонента и оборачиваем в jQuery
                            var componentHTML = component.html ? $(component.html) : $(component);
                            console.log('[Streaming Platform] Component HTML:', componentHTML);
                            console.log('[Streaming Platform] Component HTML tag:', componentHTML.prop('tagName'));
                            console.log('[Streaming Platform] Component HTML classes:', componentHTML.attr('class'));

                            // Выводим HTML для отладки
                            if (componentHTML[0]) {
                                console.log('[Streaming Platform] Component HTML content (first 500 chars):', componentHTML[0].outerHTML.substring(0, 500));
                            }

                            // Пробуем найти любые элементы с "button" в классе
                            var allButtons = componentHTML.find('[class*="button"]');
                            console.log('[Streaming Platform] All elements with "button" in class:', allButtons.length);
                            allButtons.each(function(i, el) {
                                console.log('[Streaming Platform] Button element', i, ':', el.className);
                            });

                            // Ищем контейнер разными способами
                            var container = componentHTML.find('.full-start__buttons');
                            console.log('[Streaming Platform] .full-start__buttons found:', container.length);

                            if (container.length === 0) {
                                // Пробуем глобальный поиск
                                container = $('.full-start__buttons');
                                console.log('[Streaming Platform] Global .full-start__buttons found:', container.length);
                            }

                            if (container && container.length > 0) {
                                var button = $('<div class="full-start__button selector view--online">')
                                    .html('<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="7" stroke="white"/><path d="M11 8.5L7 11V6L11 8.5Z" fill="white"/></svg><span>Смотреть онлайн</span>');

                                button.on('click', function() {
                                    Lampa.Noty.show('Кнопка работает! IMDb: ' + (card.imdb_id || 'not found'));
                                });

                                container.append(button);
                                console.log('[Streaming Platform] Button added successfully to container');
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
