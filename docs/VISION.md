# Visión de Producto — Fractal

**Versión:** 1.1.0
**Estado:** Draft
**Última revisión:** 2026-09-27

---

## 1. El problema

Iniciar un proyecto web serio consume entre 3 días y 2 semanas antes de escribir la
primera línea de lógica de negocio. Ese tiempo se va en:

- Configurar autenticación, roles y permisos
- Armar la estructura de capas
- Escribir el mismo CRUD por décima vez
- Configurar el frontend y su build pipeline
- Provisionar servidor: Docker, Nginx, certificados SSL
- Configurar CI/CD

Consecuencia: el cliente no ve nada funcionando hasta semanas después de firmar.
El feedback llega tarde y corregir sale caro.

El problema es **independiente del framework**. Se repite igual en Laravel, en Rails,
y en cualquier stack equivalente. De ahí el nombre.

---

## 2. La propuesta

Un CLI que entrega, en menos de 30 minutos:

- Una aplicación con arquitectura en capas y CRUD generado
- Autenticación con roles, permisos, OAuth y 2FA
- API REST y GraphQL
- Frontend generado
- **Desplegada en internet, con HTTPS y CI/CD activo**

Dos diferenciadores frente a JHipster:

1. **Deploy-first.** JHipster genera código. Fractal genera código **y lo pone en producción**.
2. **Multi-target real.** El dominio se define una vez, en FDL, y se proyecta a cualquier
   framework soportado.

La ambición de largo plazo va más allá del software: ver §10.

---

## 3. Usuario objetivo

**Primario:** desarrollador fullstack, freelance o en agencia pequeña, que inicia
proyectos nuevos con frecuencia y necesita mostrar avances tempranos al cliente.

En el horizonte de largo plazo (§10), el usuario objetivo se amplía a cualquier persona
con una idea por desarrollar, no necesariamente de software.

**Secundario:** equipos de 2 a 8 personas que quieren estandarizar cómo arrancan proyectos.

**Terciario:** desarrolladores que trabajan en más de un stack y quieren consistencia
arquitectónica entre ellos.

**No es para:** equipos con plataforma interna madura y estándares propios definidos.

---

## 4. Principios diferenciadores

> **Deploy-first.** El deploy no es el último paso del proyecto. Es el primero.
> Se despliega una aplicación vacía pero funcional antes de escribir lógica de negocio.

> **Un dominio, N frameworks.** El modelo de dominio se define una sola vez.
> Cambiar de target no implica reescribir la definición.

---

## 5. Arquitectura conceptual

```
              Usuario
                 │
                 ▼
        ┌─────────────────┐
        │   CLI (core)    │   prompts, orquestación
        └─────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │       FDL       │   representación intermedia
        │  entidades      │   agnóstica del framework
        │  campos         │
        │  relaciones     │
        │  reglas         │
        └─────────────────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│adapter-laravel│   │ adapter-rails │
│  stubs PHP    │   │  stubs Ruby   │
└──────────────┘    └──────────────┘
       │                   │
       └─────────┬─────────┘
                 ▼
        ┌─────────────────┐
        │  Capa de Deploy │   agnóstica del framework
        │ Docker · Nginx  │
        │ SSL · CI/CD     │
        └─────────────────┘
```

Los adapters exponen un contrato uniforme al core. El core no sabe qué hay del otro lado.

---

## 6. Alcance

### Dentro del alcance (v1)

| Capability | Descripción |
|---|---|
| `fractal new` | Genera el proyecto base para el target y la topología elegidos |
| `fractal entity` | Genera entidad y CRUD completo en todas las capas |
| `fractal deploy` | Provisiona servidor y publica en internet |
| `fractal module` | Instala módulos opcionales |

### Topologías de proyecto

`fractal new` permite elegir cómo se organiza el repositorio del proyecto
generado. Las tres comparten la misma arquitectura de frontend — React +
Vite consumiendo una API REST con auth Sanctum Bearer (ADR-0005) — y solo
difieren en la organización de repos (ADR-0010).

| Topología | Organización | Estado |
|---|---|---|
| Monolito | Un repo, sin packages separados | Default |
| Monorepo desacoplado | Un repo, packages `api/` y `web/` con Turborepo | Opcional |
| Multirepo | Dos repos git, cada uno con su pipeline CI/CD | Opcional |

### Targets

| Target | Versión | Estado |
|---|---|---|
| Laravel | LTS vigente | v1 — target de referencia |
| Ruby on Rails | 8.x | v2 — valida la arquitectura multi-target |

Laravel es el **target de referencia**: define el contrato del adapter.
Rails es el **target de validación**: si el core necesita cambios para soportarlo,
el core estaba mal diseñado.

### Fuera del alcance (v1)

- Targets distintos de Laravel
- Microservicios, Kubernetes
- Interfaz web o visual del generador
- Versiones de framework anteriores a la LTS vigente

### Fuera del alcance (permanente)

- Hosting propio o servicios gestionados
- Ser un framework. Fractal genera y se aparta.

---

## 7. Decisiones de arquitectura tomadas

| Decisión | Elección | ADR |
|---|---|---|
| Distribución | CLI Node.js que invoca la toolchain del target | ADR-0001 |
| Arquitectura multi-target | Core agnóstico + adapters | ADR-0002 |
| Definición de dominio | FDL como representación intermedia | ADR-0003 |
| Base de datos | Multi-DB seleccionable | ADR-0004 |
| Frontend Laravel | React + Vite + API (Sanctum Bearer) | ADR-0005 |
| Runtime de producción | Docker Compose | ADR-0006 |
| CI/CD | Capa agnóstica de proveedor (GitHub Actions + GitLab CI) | ADR-0007 |
| Topología de proyecto generado | Monolito (default) / monorepo desacoplado / multirepo | ADR-0010 |

---

## 8. Métricas de éxito

| Métrica | Objetivo v1 |
|---|---|
| Time-to-Production | < 30 min |
| Generación de una entidad completa | < 10 s |
| Deploy tras merge | < 3 min |
| Cobertura de tests del código generado | > 80% |
| Pasos manuales en el deploy | ≤ 2 |
| Cambios en el core al agregar el segundo target | 0 |

La última métrica es la prueba de fuego de la arquitectura.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El core se acopla a Laravel sin que lo notemos | Crítico | Lint en CI (Artículo II) + adapter Rails temprano |
| Mantener stubs al día con versiones de frameworks | Alto | Snapshots + CI contra versiones latest |
| Variedad de VPS rompe el provisioning | Alto | Solo Ubuntu LTS en v1 |
| Alcance excesivo paraliza el desarrollo | Alto | Core mínimo, resto como módulos |
| Dos targets duplican el esfuerzo de mantenimiento | Medio | Contrato de adapter estrecho y bien testeado |

---

## 10. Visión de largo plazo — más allá del software

Esta sección describe el **norte** del producto: una **ambición de largo plazo**, no el
alcance actual. Sirve para orientar decisiones de diseño; no afirma que la arquitectura
de hoy ya cubra dominios no-software.

### La ambición

La idea es **asistir al usuario final en el desarrollo de sus ideas, acompañándolo de
inicio a fin** —desde el principio hasta la realización completa de la idea—, proveyendo
las herramientas necesarias para hacerlo de forma **profesional**.

Esto aplica **ya sea a ideas de software o de cualquier otra índole**. Si la idea es de
**otra índole**, el objetivo es darle las herramientas necesarias para **crear un sistema
con todas las herramientas de administración** que el proyecto pueda necesitar (por
ejemplo, un sistema de gestión/administración a medida del proyecto).

### Relación con el alcance actual

Hoy el producto es un **generador de proyectos de _software_**: FDL como representación
intermedia, adapters Laravel/Rails, y una capa de deploy (ver §5 y §6, y los milestones
M0–M6 del ROADMAP). La visión de largo plazo **no cambia ese alcance actual**: es la
dirección que **informa** ciertas decisiones de diseño —el **agnosticismo** del core
respecto del target y la **modularidad**— para no cerrarnos puertas hacia dominios más
amplios.

No debe leerse como que la arquitectura actual **ya soporta** dominios no-software: no lo
hace, y no es lo que este documento afirma.

### Cómo se baja a la práctica

Llevar esta ambición a dominios concretos no-software **requerirá futuros ADRs y specs**,
respetando el proceso de decisión vigente. En particular, la **`CONSTITUTION.md` no se
modifica aquí**: su Artículo de Enmiendas exige un ADR para cualquier cambio. Esta sección
fija el norte; las decisiones que lo hagan realidad se tomarán, documentadas, en su momento.
