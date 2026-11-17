<?php
/**
 * Страница установки. Настроек у приложения нет — просто сообщаем Битрикс24,
 * что установка завершена.
 */
header('Content-Type: text/html; charset=utf-8');
?><!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Установка</title>
</head>
<body style="font:14px Arial,sans-serif;padding:20px">
Установка приложения…
<script src="//api.bitrix24.com/api/v1/"></script>
<script>
    BX24.init(function () {
        BX24.installFinish();
    });
</script>
</body>
</html>
