<?php
/**
 * Справочник полей и кодов Битрикс24 — главная страница приложения.
 *
 * Битрикс24 открывает этот файл POST-запросом внутри iframe (AUTH_ID, DOMAIN и т.д.).
 * Все REST-запросы выполняются в браузере через BX24 JS SDK от имени текущего
 * пользователя, поэтому на сервере ничего не хранится: ни токенов, ни настроек.
 * Совместимо с PHP 7.3+.
 */
header('Content-Type: text/html; charset=utf-8');

function asset_version($file)
{
    $path = __DIR__ . '/' . $file;
    return is_file($path) ? filemtime($path) : 1;
}
?><!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Справочник полей и кодов</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="assets/app.css?v=<?= asset_version('assets/app.css') ?>">
</head>
<body>
<div class="app">
    <div class="bar">
        <select id="src" title="Сущность или справочник"><option value="">Загрузка…</option></select>
        <input id="q" type="search" placeholder="Поиск по коду, названию, типу…  (Esc — очистить)" autocomplete="off">
        <label class="chk" id="globalWrap" title="Поиск по полям всех сущностей сразу: удобно, когда известен только код поля">
            <input type="checkbox" id="global"> во всех полях
        </label>
        <label class="chk" id="customWrap" title="Показывать только пользовательские поля (UF_…, PROPERTY_…)">
            <input type="checkbox" id="onlyCustom"> только пользовательские
        </label>
        <button class="btn" id="copyTable" title="Скопировать видимые строки (вставляется в Excel / Google Таблицы)">Копировать таблицу</button>
        <button class="btn" id="reload" title="Сбросить кэш и загрузить данные заново">Обновить</button>
    </div>
    <div class="info" id="info"></div>
    <div class="wrap" id="wrap"><div class="msg">Подключение к Битрикс24…</div></div>
</div>
<div class="toast" id="toast"></div>

<script src="//api.bitrix24.com/api/v1/"></script>
<script src="assets/app.js?v=<?= asset_version('assets/app.js') ?>"></script>
</body>
</html>
