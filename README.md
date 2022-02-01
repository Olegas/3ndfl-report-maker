# Заполнение дохода за пределами РФ в декларации 3-НДФЛ

## Disclaimer

Автор не несет ответственности за корректное заполнение налоговой декларации. 
Вы запускаете данную утилиту на свой страх и риск. 
Если все же решили запускать - рекомендуется проверить результат "глазами", утилита в стадии разработки.

## Установка

1. Требуется NodeJs 16+
2. В папке утилиты выполнить `npm install` для установки зависимостей
3. Запустить, указав первым параметром путь до налогового отчета `node ./src/index.js ./out-inc-state-2021.pdf`

## Особенности работы

Утилита вносит данные о доходах за пределами РФ непосредственно на сайт nalog.ru через браузер Chromium.

Утилита НЕ запрашивает логин и пароль пользователя. 
Вход на сайт нужно осуществить самостоятельно любым доступным способом (ЕСИА, логин/пароль).

При работе в корне утилиты будет создана папка `.userData` - сервисная папка для хранения данных браузера Chromium,
запускаемого в процессе работы утилиты. Данную папку можно удалить после завершения работы.
