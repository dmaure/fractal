# ADR-0007: CI/CD para deploy por merge

**Estado:** Propuesto
**Fecha:** 2026-08-08
**Decisores:** Diego

---

## Contexto

SPEC-0003 (deploy inicial a VPS) depende bloqueantemente de este ADR. Sus
criterios de aceptación ya son específicos: AC-8 pide que el CLI genere
`.github/workflows/deploy.yml` y liste "los secrets exactos que debo cargar
en GitHub"; AC-9 exige que mergear a la rama de producción dispare deploy en
menos de 3 minutos; AC-10 exige rollback automático si el healthcheck
posterior falla. VISION.md (sección 7) también anota "CI/CD: GitHub Actions"
en su tabla de decisiones. Igual que en ADR-0006, ninguna de esas dos
menciones es un ADR aceptado, así que este ADR trata la elección como
pendiente de confirmación formal, no como hecho consumado. Si la decisión
final no es GitHub Actions, SPEC-0003 (AC-8) necesita revisión antes de
Aprobado.

Vale una aclaración de alcance: esto decide el CI/CD del **proyecto que
Fractal genera** para el usuario final —el mecanismo de deploy por merge que
describe SPEC-0003—, no el CI del propio repositorio de Fractal (ese es el
ítem separado "CI base: lint, tests, matriz de versiones" del roadmap M0,
sobre este mismo repo). Son decisiones relacionadas pero distintas: el
repositorio de Fractal ya vive en GitHub (`github.com/dmaure/fractal`, dato
verificable, no una intención) y probablemente use GitHub Actions también
para sí mismo, pero eso no obliga a que el proyecto generado deba usar el
mismo proveedor.

Restricciones relevantes:

- **Artículo VI (Seguridad no es opcional)**: "secrets fuera del
  repositorio". El mecanismo de CI/CD elegido es, en la práctica, el lugar
  donde esos secrets van a vivir.
- **Artículo VII (reversibilidad)** y **AC-10**: el rollback automático ante
  healthcheck fallido debe poder implementarse dentro de lo que ofrezca el
  mecanismo elegido.
- **Artículo VIII (Idempotencia)**: mergear dos veces con el mismo estado no
  debe romper nada.
- **"Pasos manuales en el deploy ≤ 2"** y **TTP < 30 min** (VISION.md,
  sección 8): el mecanismo no puede introducir configuración manual
  recurrente en cada deploy, solo en el setup inicial.
- Un proveedor de CI/CD específico no es un framework en el sentido literal
  del Artículo II —no está en la lista de términos prohibidos de ADR-0002—
  pero genera el mismo tipo de riesgo de acoplamiento que ya se señaló para
  motores de DB (ADR-0004) y runtime de producción (ADR-0006): atar
  `packages/deploy` a un proveedor concreto es una forma de acoplamiento
  externo, aunque no sea a Laravel o Rails.
- A diferencia de Kubernetes en ADR-0006, VISION.md **no excluye**
  explícitamente otros proveedores Git de su alcance, así que esa alternativa
  sí se desarrolla acá como opción real.

---

## Opciones consideradas

### Opción A: GitHub Actions

`packages/deploy` genera `.github/workflows/deploy.yml` y documenta los
secrets exactos a cargar en la configuración de GitHub del repositorio del
usuario, tal como ya describe SPEC-0003 (AC-8).

- **A favor:** coincide directamente con lo que SPEC-0003 ya especifica en
  AC-8 y AC-9; el propio repositorio de Fractal ya vive en GitHub, mismo
  proveedor que el equipo ya usa, sin fricción adicional para dogfooding;
  ampliamente adoptado por el perfil de usuario objetivo (freelance,
  agencias chicas), curva de aprendizaje mínima; los secrets de GitHub
  Actions resuelven el requisito del Artículo VI sin infraestructura
  adicional que mantener; los runners son hospedados por GitHub, cero
  infraestructura de CI propia que operar.
- **En contra:** ata el flujo de deploy-por-merge a que el usuario aloje su
  repositorio específicamente en GitHub; un usuario o agencia que ya use
  GitLab o Bitbucket como estándar no podría usar `fractal deploy` sin
  migrar de proveedor Git (aunque VISION.md ya dice que equipos con
  estándares propios maduros "no son" el público de Fractal, lo que atenúa
  parcialmente este punto); es el mismo patrón de acoplamiento externo que
  ya se señaló como riesgo análogo en ADR-0004 y ADR-0006, aplicado ahora al
  proveedor de hosting Git.

### Opción B: Capa de CI/CD agnóstica de proveedor Git

`packages/deploy` mantiene plantillas de workflow para más de un proveedor
(GitHub Actions y GitLab CI, por ejemplo), y genera la que corresponda según
dónde viva el repositorio del usuario.

- **A favor:** no ata a un único proveedor de hosting Git; da soporte real al
  usuario secundario que ya tenga GitLab como estándar de equipo; consistente
  con el espíritu de "paridad, no uniformidad" (Artículo III) aplicado por
  analogía a proveedores de CI en vez de frameworks.
- **En contra:** duplica el trabajo de mantener y testear plantillas de
  workflow por proveedor, cuya sintaxis no es intercambiable; el contrato de
  "secrets exactos a cargar" (AC-8) y el mecanismo de rollback (AC-10)
  tendrían que expresarse de forma neutral y traducirse por proveedor,
  multiplicando la superficie a mantener (framework × motor de DB ×
  proveedor de CI); se abstraería sin un caso de uso concreto hoy —Fractal
  mismo vive en GitHub—, el mismo riesgo de abstracción prematura que
  ADR-0002 ya decidió evitar para adapters sin evidencia real.

### Opción C: Trigger de deploy autohospedado, independiente de cualquier proveedor de CI SaaS

En vez de un workflow que corre del lado del proveedor Git, el VPS mismo
corre un listener liviano que recibe un webhook de push y ejecuta el deploy
localmente. Cualquier proveedor Git que soporte webhooks salientes —lo que
en la práctica es casi cualquiera— puede dispararlo.

- **A favor:** agnóstico real de proveedor de hosting Git sin duplicar
  plantillas de workflow por proveedor, porque la lógica de deploy vive en
  un solo lugar (el VPS) en vez de N sintaxis de CI distintas; no depende de
  minutos de CI de terceros ni de la disponibilidad de un proveedor externo
  para que el deploy funcione.
- **En contra:** el VPS pasa a exponer un endpoint capaz de disparar
  deploys, superficie de ataque nueva que el Artículo VI (firewall
  deny-by-default) obliga a blindar explícitamente (autenticación del
  webhook, rate limiting, todo a diseñar); el "workflow inspeccionable"
  que hoy espera SPEC-0003 (AC-8) deja de existir como tal, perdiendo la
  visibilidad de logs que da una plataforma de CI ya conocida; construir y
  mantener el listener —incluyendo su propio mecanismo de rollback ante
  healthcheck fallido, AC-10— pasa a ser responsabilidad de Fractal en vez
  de delegarse en infraestructura ya probada de un proveedor externo.

---

## Decisión

Pendiente. Diego decide entre las opciones desarrolladas arriba.

Nota: si la decisión confirma GitHub Actions (Opción A), este ADR formaliza
lo que SPEC-0003 (AC-8, AC-9) ya asume y no requiere cambios ahí. Si elige
B o C, SPEC-0003 debe actualizarse antes de pasar a Aprobado.

---

## Consecuencias

Pendiente de la opción elegida.

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
