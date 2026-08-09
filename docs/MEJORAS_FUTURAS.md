# Mejoras a Futuro

> Ideas y áreas de mejora identificadas durante el diseño, que no bloquean
> las decisiones actuales pero conviene no perder. No son compromisos ni
> specs — son candidatas a futuras specs/ADRs si se vuelven prioridad.

## Cómo usar este documento

Cada entrada registra qué se identificó, de dónde salió (qué ADR, spec o
conversación lo originó), y por qué se pospuso en vez de resolverse ahora.
Cuando una entrada madura lo suficiente como para convertirse en trabajo
real, se promueve a un ADR o spec propio y se marca acá como resuelta.

---

## Registro

### Runtime configurable para VPS con infraestructura preexistente

**Origen:** ADR-0006 (runtime de producción), decisión del 2026-08-09
**Contexto:** la Opción A (Docker Compose) elegida asume que Fractal
provisiona el stack completo desde cero. En la práctica, un VPS puede ya
tener servicios corriendo — por ejemplo, un contenedor Nginx propio
administrando otros sitios — y forzar un stack Compose nuevo completo no es
lo que se necesita ahí. Lo deseable sería que `packages/deploy` pudiera
limitarse a agregar la configuración del proyecto generado (un vhost de
Nginx, por ejemplo) a infraestructura ya existente, en vez de asumir
siempre control total del servidor.
**Por qué se pospone:** no hay claridad todavía sobre cuál sería el mejor
mecanismo (¿detección automática de servicios existentes? ¿un modo "bring
your own reverse proxy"? ¿plantillas de configuración separadas del
provisioning del stack?). Falta más señal de uso real antes de diseñarlo.
**Estado:** Idea, sin spec ni ADR.
