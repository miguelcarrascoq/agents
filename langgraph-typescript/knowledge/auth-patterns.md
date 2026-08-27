# Patrones de autenticación (JWT)

## Conceptos

- **Access token (JWT):** corta duración (5–15 min). Contiene `sub`, `exp`, roles/claims.
- **Refresh token:** larga duración, opaco o rotativo, almacenado de forma segura (httpOnly cookie o store server-side).
- **Rotación:** al usar un refresh token, invalidar el anterior y emitir uno nuevo.

## Checklist mínimo

1. Hash de passwords con algoritmo moderno (bcrypt/argon2).
2. Separar endpoints: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`.
3. Middleware que valida JWT en rutas protegidas.
4. No poner secretos en el código; usar variables de entorno.
5. Rate limiting en login/refresh para mitigar brute force.

## Esqueleto típico (FastAPI)

```python
# auth.py — conceptual
def create_access_token(sub: str) -> str: ...
def create_refresh_token(sub: str) -> str: ...
def verify_access_token(token: str) -> dict: ...
```

## Errores comunes

- Refresh token sin rotación ni revocación.
- JWT con secret débil o hardcodeado.
- Exponer refresh token en localStorage (XSS).
