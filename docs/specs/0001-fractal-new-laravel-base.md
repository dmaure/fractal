# SPEC-0001: `fractal new` genera proyecto Laravel base

**Estado:** Aprobado
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
- **Cuando** mido el tiempo entre invocación y finalización, sin contar el
  tiempo que el usuario tarda en responder los prompts
- **Entonces** termina en menos de **5 minutos**

### AC-8: Directorio destino existente
- **Dado** que el directorio destino ya existe
- **Cuando** ejecuto `fractal new` apuntando a ese directorio
- **Entonces** el comando aborta con un mensaje claro y no modifica nada,
  salvo que el directorio esté vacío o contenga únicamente un `.git` sin
  historia (repo recién clonado vacío), en cuyo caso continúa con
  normalidad

### AC-9: Override explícito
- **Dado** que quiero forzar la generación sobre un directorio no vacío
- **Cuando** ejecuto `fractal new` con el flag `--force`
- **Entonces** el comando procede sin abortar — comportamiento avanzado,
  nunca el default (Artículo IV)

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
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Aprobado |
| SPEC-0006 (contrato del adapter, no escrito aún) | Blanda | — |

---

## 7. Consideraciones técnicas

**Rendimiento**
- 5 minutos surge de repartir el presupuesto de TTP < 30 min: SPEC-0003 ya
  fija el provisioning completo en < 15 min, y `fractal new` es la parte más
  controlable de lo que queda (no depende de propagación DNS ni de paneles
  de terceros). Deja 10 minutos de colchón para todo lo manual que el CLI
  no controla.

**Seguridad**
- Ninguna credencial de ejemplo capaz de llegar a producción (Artículo VI)
- `APP_KEY` y cualquier secret se generan localmente, nunca se commitean

**Compatibilidad**
- Laravel LTS vigente (VISION.md sección 6)
- La validación de versión mínima de PHP/Composer **no es responsabilidad
  de este spec**. Por Artículo II, el core no puede saber que Laravel
  necesita PHP 8.2+ o Composer 2.x — ese umbral es conocimiento del
  framework. `adapter-laravel` declara la versión mínima requerida a través
  del contrato de adapter (SPEC-0006), y el mecanismo genérico de detección
  de binario ausente **o insuficiente** vive en SPEC-0002 (AC-4).

---

## 8. Preguntas abiertas

Ninguna pendiente. Las tres preguntas originales se resolvieron el
2026-08-09:
- Tiempo de ejecución → AC-7 (5 minutos)
- Validación de versión de PHP/Composer → delegada a SPEC-0002 (AC-4) +
  contrato de adapter (SPEC-0006), ver sección 7
- Directorio destino existente → AC-8 y AC-9

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Tests de snapshot de los stubs actualizados
- [ ] Test end-to-end pasa
- [ ] Documentación de usuario escrita
- [ ] ADRs asociados creados si hubo decisiones técnicas
- [ ] Este spec marcado como Implementado
