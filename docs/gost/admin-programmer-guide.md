# Руководство системного администратора / программиста

## Установка
1. Установить Node.js 20+
2. Выполнить `npm install`
3. Запустить `npm run start:all` или `docker compose -f infra/docker/docker-compose.yml up`

## Настройка
- `JWT_SECRET` — секрет токенов
- `DATA_KEY` — ключ шифрования контента
- URL сервисов задаются переменными окружения API Gateway

## Интеграция
- REST API через API Gateway (порт 4000)
- Внешние LMS/CRM подключаются через REST-контракты сервисов

## Резервное копирование и восстановление
- Для production: снапшоты PostgreSQL и экспорт событий аналитики
- В текущем MVP данные сервисов, кроме PostgreSQL/Redis/RabbitMQ, in-memory
