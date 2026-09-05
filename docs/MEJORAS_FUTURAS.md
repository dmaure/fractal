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

### Notificación activa de fallos en el workflow de n8n

**Origen:** incidente real del 2026-09-05 (ver `ARCHITECTURE_WORKFLOW.md`,
sección "Gap 2 — validación final"). El chequeo de PRs pendientes falló
silenciosamente cada 5 minutos durante horas (bug de referencia + token
mal configurado), bloqueando todo el pipeline por el límite de
concurrencia, sin que nadie lo notara hasta que Diego preguntó por qué "no
pasaba nada".
**Contexto:** hoy el único lugar donde un fallo del workflow es visible es
el historial de ejecuciones de n8n — nadie lo mira proactivamente. Un
sistema desatendido necesita avisar cuando se rompe, no esperar a que
alguien note la ausencia de progreso.
**Por qué se pospone:** no es bloqueante para seguir usando el pipeline
manualmente supervisado como está ahora; conviene resolverlo antes de
confiar en el sistema para correr desatendido por períodos largos (ej.
toda la noche).
**Estado:** Idea, sin spec ni ADR. Candidatos obvios: nodo de notificación
(Slack/email/Telegram) en el branch de error de cada HTTP Request node, o
un `errorWorkflow` a nivel de todo el workflow de n8n.
