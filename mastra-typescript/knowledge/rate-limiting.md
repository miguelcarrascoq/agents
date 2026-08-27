# Rate limiting

## Por qué

Protege login, refresh y endpoints costosos de abuso y DoS ligero.

## Estrategias

- **Fixed window:** simple, puede tener burst en el borde de la ventana.
- **Sliding window:** más suave.
- **Token bucket:** permite ráfagas controladas.

## Claves típicas

- Por IP.
- Por user id (si autenticado).
- Por API key.

## Respuesta

- HTTP 429.
- Headers `Retry-After` y/o `X-RateLimit-Remaining`.

## Implementación conceptual

```python
# middleware conceptual
def check_rate_limit(key: str, limit: int, window_s: int) -> bool:
    """True si se permite la request."""
    ...
```

Empezar simple (in-memory / Redis) según el entorno.
