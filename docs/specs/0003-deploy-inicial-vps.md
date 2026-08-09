# SPEC-0003: Deploy inicial a VPS

**Estado:** Draft
**Autor:** Diego
**Fecha:** 2026-08-01
**Issue:** #

---

## 1. Objetivo

Permitir que un usuario, partiendo de un VPS recién creado y un repositorio Git,
tenga su aplicación accesible en internet con HTTPS y deploy automático por merge,
sin escribir un solo comando de servidor.

---

## 2. Motivación

El deploy inicial es el mayor bloqueo entre "tengo código" y "el cliente lo puede ver".
Consume días de trabajo repetitivo y es donde más errores de seguridad se cometen
(puertos abiertos, root habilitado, secrets en el repo).

Automatizarlo permite el principio deploy-first: mostrar avances desde el día uno.

---

## 3. Historias de usuario

- Como **desarrollador**, quiero dar la IP y credenciales de mi VPS para que el
  sistema instale todo lo necesario, sin tener que saber administración de servidores.
- Como **desarrollador**, quiero que mi dominio apunte al servidor automáticamente
  cuando uso Cloudflare, para no configurar DNS a mano.
- Como **desarrollador**, quiero que al mergear a `production` mis cambios estén
  online en pocos minutos, sin intervención manual.
- Como **desarrollador**, quiero que si un deploy falla, la versión anterior siga
  funcionando, para no dejar al cliente sin servicio.

---

## 4. Criterios de aceptación

### AC-1: Recolección de datos
- **Dado** que ejecuto `fractal deploy` en un proyecto generado
- **Cuando** el CLI arranca
- **Entonces** se me solicitan: IP, usuario SSH, método de autenticación, dominio,
  proveedor DNS, repositorio Git y rama de producción

### AC-2: Validación previa
- **Dado** que ingresé los datos del servidor
- **Cuando** el CLI intenta conectarse
- **Entonces** verifica conectividad SSH, distribución compatible (Ubuntu LTS),
  recursos mínimos (1 vCPU, 2 GB RAM, 20 GB disco) y aborta con mensaje claro si algo falla

### AC-3: Hardening del sistema
- **Dado** que la conexión SSH es exitosa
- **Cuando** corre el provisioning
- **Entonces** se crea un usuario `deploy` no-root, se deshabilita el login root por SSH,
  se deshabilita la autenticación por contraseña y se configura UFW con solo 22, 80 y 443 abiertos

### AC-4: Runtime
- **Dado** que el sistema está endurecido
- **Cuando** continúa el provisioning
- **Entonces** quedan instalados y activos: Docker CE, Docker Compose plugin, Git,
  y los contenedores app, nginx, db, redis, worker y scheduler corriendo

### AC-5: DNS automatizado
- **Dado** que elegí Cloudflare y proporcioné un API token
- **Cuando** corre el paso de DNS
- **Entonces** se crean los registros A para el dominio raíz y `www` apuntando a la IP,
  y se espera a que la propagación se confirme

### AC-6: DNS manual
- **Dado** que elegí configuración manual
- **Cuando** corre el paso de DNS
- **Entonces** el CLI muestra los registros exactos a crear y hace polling hasta
  detectar la propagación, con opción de continuar más tarde

### AC-7: SSL
- **Dado** que el DNS resuelve a la IP del servidor
- **Cuando** corre el paso de SSL
- **Entonces** se emite un certificado Let's Encrypt válido, se configura la
  renovación automática y todo el tráfico HTTP redirige a HTTPS

### AC-8: CI/CD
- **Dado** que el provisioning terminó
- **Cuando** el CLI genera el workflow
- **Entonces** se genera el workflow o pipeline correspondiente al proveedor
  de CI/CD elegido (GitHub Actions o GitLab CI, según ADR-0007), y se listan
  los secrets exactos que debo cargar en ese proveedor

### AC-9: Deploy por merge
- **Dado** que los secrets están configurados
- **Cuando** mergeo un PR a la rama de producción
- **Entonces** el workflow despliega, ejecuta migraciones, limpia caches y
  verifica un healthcheck en menos de 3 minutos

### AC-10: Rollback
- **Dado** que un deploy fue disparado
- **Cuando** el healthcheck posterior falla
- **Entonces** se restaura la versión anterior automáticamente y el workflow
  reporta fallo sin haber dejado el sitio caído

### AC-11: Idempotencia
- **Dado** que ya ejecuté `fractal deploy` con éxito
- **Cuando** lo ejecuto nuevamente con los mismos parámetros
- **Entonces** el resultado es idéntico, sin duplicar configuración ni romper el servicio

### AC-12: Agnosticismo de framework
- **Dado** el código de `packages/deploy`
- **Cuando** corre el lint de acoplamiento en CI
- **Entonces** no se detecta ninguna referencia a un framework concreto, y todo dato
  específico del target proviene del contrato del adapter (comando de build, comando
  de migración, puerto expuesto, ruta de healthcheck)

---

## 5. Fuera de alcance

- Compra de dominios
- Proveedores DNS distintos de Cloudflare y Route53 (los demás son manuales)
- Sistemas operativos distintos de Ubuntu LTS
- Balanceo de carga, múltiples servidores, alta disponibilidad
- Backups automatizados (SPEC futuro)
- Monitoreo y alertas (SPEC futuro)

---

## 6. Dependencias

| Depende de | Tipo | Estado |
|---|---|---|
| SPEC-0001 (comando `new`) | Bloqueante | Draft |
| SPEC-0002 (bridge Node → toolchain) | Bloqueante | Draft |
| ADR-0006 (runtime de producción) | Bloqueante | Aceptado |
| ADR-0007 (CI/CD para deploy por merge) | Bloqueante | Aceptado |

---

## 7. Consideraciones técnicas

**Seguridad**
- Las credenciales SSH nunca se persisten en disco en texto plano
- El `.env` de producción se genera en el servidor, nunca viaja por el repositorio
- `APP_KEY` se genera en el servidor en el primer provisioning

**Rendimiento**
- El provisioning completo debe terminar en menos de 15 minutos
- Los deploys posteriores no reconstruyen la imagen salvo que cambien las dependencias

**Compatibilidad**
- Ubuntu 22.04 LTS y 24.04 LTS

---

## 8. Preguntas abiertas

- [ ] ¿Rollback por reinicio de contenedor anterior o por tag de imagen versionada?
- [ ] ¿Dónde se almacena el estado del provisioning para garantizar idempotencia?
- [ ] ¿Se soporta el escenario de múltiples entornos (staging + production) en v1?
- [ ] ¿Qué hacer si el usuario ya tiene servicios corriendo en el VPS?

---

## 9. Definition of Done

- [ ] Todos los criterios de aceptación tienen test automatizado
- [ ] Test end-to-end contra un VPS efímero real pasa en CI
- [ ] Documentación de usuario escrita
- [ ] ADR-0006 y ADR-0007 creados y aceptados
- [ ] Spec marcado como Implementado
