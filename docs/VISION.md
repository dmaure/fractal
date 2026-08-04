# Visión de Producto — Fractal

**Versión:** 1.0.0
**Estado:** Draft
**Última revisión:** 2026-08-02

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

---

## 3. Usuario objetivo

**Primario:** desarrollador fullstack, freelance o en agencia pequeña, que inicia
proyectos nuevos con frecuencia y necesita mostrar avances tempranos al cliente.

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
| `fractal new` | Genera el proyecto base para el target elegido |
| `fractal entity` | Genera entidad y CRUD completo en todas las capas |
| `fractal deploy` | Provisiona servidor y publica en internet |
| `fractal module` | Instala módulos opcionales |

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
| Frontend Laravel | React + Inertia | ADR-0005 |
| Runtime de producción | Docker Compose | ADR-0006 |
| CI/CD | GitHub Actions | ADR-0007 |

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
