# Testing básico para features

## Pirámide práctica

1. **Unit:** funciones puras (hash, claims JWT, validadores).
2. **Integration:** rutas HTTP contra app en memoria / test client.
3. **E2E:** solo el camino crítico (login → acción protegida).

## Qué testear en auth

- Register crea usuario y no expone password.
- Login inválido → 401.
- Access token expirado → 401.
- Refresh rota el token y el viejo falla.

## Qué testear en rate limit

- N requests OK, N+1 → 429.
- Otra clave (IP/user) no se ve afectada.

## Convención

Preferir nombres `test_<comportamiento>` y fixtures mínimas.
