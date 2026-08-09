# SPEC-0001: `fractal new` genera proyecto Laravel base

**Estado:** Draft
**Autor:** Diego
**Fecha:** 2026-08-09
**Issue:** #

---

## 1. Objetivo

Permitir que un usuario obtenga, con un solo comando, un proyecto Laravel
nuevo con la arquitectura en capas de Fractal ya configurada, listo para
desarrollar.

---

## 2. Motivación

Iniciar un proyecto Laravel implica repetir instalación, configuración de
estructura en capas y convenciones de organización cada vez. Ese trabajo no
tiene valor de negocio y consume tiempo antes de escribir la primera línea
de lógica real.

Este comando es el primer paso concreto hacia el objetivo de TTP < 30 min
(Artículo I): sin un `new` que funcione, no hay nada que desplegar después.

---

## 3. Historias de usuario

- Como **desarrollador**, quiero ejecutar `fractal new mi-proyecto` y tener
  un proyecto Laravel funcional, sin configurar la estructura en capas a
  mano.
- Como **desarrollador**, quiero que el CLI me pregunte solo lo esencial y
  complete el resto con defaults sensatos, para no bloquearme en decisiones
  que no me importan todavía.
- Como **desarrollador**, quiero que el proyecto generado corra localmente
  de inmediato, para verificar que todo funciona antes de seguir.

---

## 4. Criterios de aceptación

### AC-1: Comando mínimo
- **Dado** que tengo Node.js, PHP y Composer instalados
- **Cuando** ejecuto `npx fractal new mi-proyecto` sin flags adicionales
- **Entonces** el CLI no pregunta nada más allá de lo estrictamente
  necesario (target, si no hay uno único todavía) y genera el proyecto

### AC-2: Estructura en capas
- **Dado** que elegí Laravel como target (único disponible en v1)
- **Cuando** el comando termina
- **Entonces** el proyecto generado sigue la estructura en capas que define
  el contrato del adapter (SPEC-0006), reconocible como Laravel idiomático
  por un desarrollador Laravel (Artículo III)

### AC-3: Proyecto autónomo
- **Dado** que el proyecto fue generado
- **Cuando** reviso sus dependencias de runtime
- **Entonces** no tiene ninguna dependencia de Fractal — corre solo con las
  herramientas estándar de Laravel (Artículo V)

### AC-4: Corre localmente
- **Dado** que el proyecto fue generado
- **Cuando** sigo las instrucciones que el CLI imprime al terminar
- **Entonces** la aplicación levanta localmente sin errores

### AC-5: Sin secrets comprometidos
- **Dado** que el proyecto fue generado
- **Cuando** reviso el repositorio resultante
- **Entonces** no contiene ninguna credencial real ni un `APP_KEY` capaz de
  llegar a producción (Artículo VI); `.env` está en `.gitignore` desde el
  primer commit

### AC-6: Git inicializado
- **Dado** que el comando termina exitosamente
- **Cuando** reviso la carpeta del proyecto
- **Entonces** ya es un repositorio git con un commit inicial, listo para
  conectar a un remoto

### AC-7: Tiempo de ejecución acotado
- **Dado** que el comando corre en condiciones normales de red
- **Cuando** mido el tiempo entre invocación y finalización
- **Entonces** termina dentro del presupuesto que permite cumplir TTP < 30
  min junto con `fractal deploy` (número exacto a calibrar — ver preguntas
  abiertas)

---

## 5. Fuera de alcance

- Ruby on Rails como target (M4)
- Generación de entidades y CRUD (M2)
- Autenticación, roles y permisos (M3)
- Deploy a VPS (SPEC-0003)
- Instalación de módulos opcionales (M5)

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| ADR-0001 (CLI híbrido Node) | Bloqueante | Aceptado |
| ADR-0002 (arquitectura multi-target) | Bloqueante | Aceptado |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Draft |

---

## 7. Consideraciones técnicas

**Rendimiento**
- El comando debe dejar margen suficiente dentro del presupuesto de TTP <
  30 min compartido con `fractal deploy`

**Seguridad**
- Ninguna credencial de ejemplo capaz de llegar a producción (Artículo VI)
- `APP_KEY` y cualquier secret se generan localmente, nunca se commitean

**Compatibilidad**
- Laravel LTS vigente (Artículo, VISION.md sección 6)
- Versión mínima de PHP y Composer a validar antes de generar (ver SPEC-0002
  AC-4, detección de dependencias faltantes)

---

## 8. Preguntas abiertas

- [ ] ¿Cuál es el número exacto de minutos aceptable para este comando,
      dentro del presupuesto total de TTP < 30 min?
- [ ] ¿El comando valida versión de PHP/Composer antes de generar, o asume
      que ya están instalados y delega la detección a SPEC-0002?
- [ ] ¿Qué pasa si el directorio destino ya existe y no está vacío?

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
