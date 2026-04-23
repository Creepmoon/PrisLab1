# EduSphere MVP (PrisLab1)

Микросервисный каркас образовательной платформы с адаптивным обучением и базовой поддержкой AR-сценариев.

## Состав
- `services/api-gateway`
- `services/auth-service`
- `services/content-service`
- `services/gradebook-service`
- `services/plan-builder-service`
- `services/analytics-service`
- `services/ar-session-service`
- `apps/web`
- `packages/shared`
- `infra/`
- `docs/gost/`

## Быстрый запуск
```bash
npm install
npm run start:all
```

API Gateway: `http://localhost:4000`  
Web: `http://localhost:3000`

## Ключевые требования, закрытые MVP
- Роли и аутентификация (student/teacher/admin)
- Хранение учебных материалов с шифрованием AES-256-GCM
- Журнал оценок
- Генератор индивидуальных планов + проверка точности рекомендаций
- AR device-check и fallback-режим
- Базовая аналитика и мониторинг прогресса
- Артефакты инфраструктуры: Docker Compose, Kubernetes, Prometheus
- ГОСТ-ориентированный набор документации
