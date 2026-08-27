# Checklist de code review

## Correctitud

- [ ] ¿La implementación cubre los criterios de aceptación?
- [ ] ¿Hay casos borde no manejados (vacío, null, duplicados)?
- [ ] ¿Los errores se propagan o se tragan en silencio?

## Seguridad

- [ ] Validación de inputs en el borde (API).
- [ ] Secretos fuera del código.
- [ ] Authz: ¿solo autenticación o también autorización por rol/recurso?
- [ ] Sin inyecciones (SQL, comando, path traversal en `write_file`).

## Diseño

- [ ] Separación de capas (routes / services / storage).
- [ ] Nombres claros; funciones pequeñas.
- [ ] Sin sobre-ingeniería para el alcance pedido.

## Operación

- [ ] Logs útiles sin datos sensibles.
- [ ] Configuración vía env.
- [ ] Tests o al menos caminos felices documentados.

## Veredicto sugerido

- **approve** — listo para merge con nits menores.
- **request_changes** — bloqueantes de seguridad o de aceptación.
- **comment** — feedback no bloqueante.
