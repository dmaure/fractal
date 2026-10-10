# ADR-0014: Stubs Laravel versionados en el adapter

**Estado:** Aceptado
**Fecha:** 2026-10-10
**Decisores:** Diego
**Relacionado con:** FRA-52, SPEC-0006

---

## Contexto

FRA-42 entregó un generador de proyecto Laravel base, pero sin el esqueleto
ejecutable completo: faltan `artisan`, `bootstrap/`, `config/`, `database/`
y `storage/`. Sin estos archivos, `composer install` termina pero la app no
puede correr — `php artisan` falla porque `bootstrap/app.php` no existe.

Para completar el esqueleto hay dos caminos:

**(a)** Stubs propios versionados en el adapter
- Escribimos y mantenemos los archivos `artisan`, `bootstrap/app.php`,
  `bootstrap/providers.php`, `config/app.php`, etc. como stubs TypeScript
  dentro de `packages/adapter-laravel/src/stubs/`.
- Cada stub genera exactamente el mismo contenido cada vez (determinístico).
- Los snapshots capturan el resultado exacto; cambios a los stubs requieren
  actualizar los snapshots en el mismo PR.
- No hay red involucrada en la generación — funciona offline.
- Coherente con lo ya implementado para `composer.json`, `.gitignore`,
  `README.md`, etc.

**(b)** `composer create-project laravel/laravel` + overlay de Fractal
- Correr `composer create-project` para obtener el esqueleto oficial de
  Laravel, luego superponer los stubs de Fractal.
- Siempre actual con la versión upstream de Laravel.
- Depende de red y del registro de Packagist.
- No determinístico: Laravel puede publicar parches menores que cambien
  archivos de config, rompiendo los snapshots sin que el adapter cambie.
- Más lento: agregar un `composer create-project` al flujo de `fractal new`
  suma 1-2 minutos al TTP.

---

## Decisión

Elegimos la **opción (a): stubs propios versionados** en
`packages/adapter-laravel/src/stubs/`.

**Razones:**

1. **Determinismo:** los snapshots son la primera línea de defensa contra
   regresiones (Artículo X). Una fuente externa que muta rompe ese contrato.
2. **Offline-first:** `fractal new` no debe depender de red salvo para
   `composer install` y `npm install`, que son inevitables. El esqueleto
   base debe generarse offline.
3. **Coherencia:** ya usamos stubs propios para `composer.json`,
   `.gitignore`, `README.md`, `package.json`, controllers, routes. Los
   archivos de bootstrap y config son la misma clase de conocimiento.
4. **TTP:** no sumar red ni tiempo de `composer create-project` al camino
   crítico.
5. **Control:** Laravel 11 cambió la estructura de `bootstrap/` frente a
   Laravel 10. Versionamos en `composer.json` (`laravel/framework: ^11.0`)
   y los stubs reflejan esa versión. Si en el futuro soportamos Laravel 12,
   el adapter decide qué generar según la versión elegida — no queda librado
   a qué venga del upstream.

**Desventajas aceptadas:**

- Mantenimiento: al actualizar la versión de Laravel soportada, hay que
  revisar si cambió algo en `bootstrap/`, `config/`, etc. y actualizar los
  stubs. Es trabajo manual pero acotado (una vez por versión mayor de
  Laravel) y predecible.
- Divergencia: si Laravel introduce un cambio que nosotros no reflejamos, el
  proyecto generado no tendrá esa mejora hasta que actualicemos el stub. Es
  el trade-off del control — elegimos determinismo sobre estar al día
  automáticamente.

---

## Consecuencias

### Positivas
- Los snapshots siguen siendo confiables.
- `fractal new` funciona sin red (salvo install de dependencias).
- El tiempo de `fractal new` no crece.
- El esqueleto generado es predecible y revisable en cada PR.

### Negativas
- Responsabilidad de mantenimiento: al subir la versión de Laravel, revisar
  y actualizar los stubs.
- No heredamos mejoras upstream de forma automática.

### Neutras / a monitorear
- Si Laravel introduce cambios significativos en el esqueleto entre
  versiones menores (poco común), los stubs pueden quedar atrás hasta que
  alguien lo detecte y actualice.
- Si en el futuro soportamos múltiples versiones de Laravel en paralelo
  (ej., Laravel 11 y 12), el adapter necesitará lógica condicional para
  elegir qué stub generar. Ese problema no existe hoy (solo Laravel 11).

---

## Notas

Un ADR no se edita después de ser aceptado. Si la decisión cambia, se crea un
ADR nuevo que lo reemplaza y se actualiza el campo Estado de este.
