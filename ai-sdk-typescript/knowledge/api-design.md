# Diseño de APIs HTTP

## Principios

- Recursos en plural (`/todos`, `/users`).
- Verbos HTTP con semántica clara: GET lectura, POST creación, PATCH actualización parcial, DELETE borrado.
- Códigos de estado honestos: 200/201, 400 validación, 401 auth, 403 permisos, 404, 409 conflicto, 429 rate limit.
- Errores en formato consistente: `{ "error": { "code": "...", "message": "..." } }`.

## Versionado

- Preferir `/v1/...` o header `Accept-Version` cuando haya breaking changes.

## Paginación

- Cursor o `limit`/`offset` documentados.
- Incluir `next` o `total` según el caso.

## Idempotencia

- PUT/DELETE deberían ser idempotentes.
- Para POST sensibles, considerar `Idempotency-Key`.

## Contratos

Definir schemas de request/response antes de implementar (OpenAPI o modelos Pydantic/Zod).
