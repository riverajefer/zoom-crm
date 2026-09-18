# DIVERGENCIA.md — Zoom CRM respecto a High Solutions

Este repositorio es un **fork independiente** del backoffice de High Solutions, no un multi-tenant. Comparte historia de git con el original pero evoluciona por separado.

| | |
|---|---|
| **Origen** | `riverajefer/hight-solutions-backoffice` |
| **Punto de bifurcación** | tag `fork-zoom-2026-09` · commit `eee96a9` (rama `develop`) |
| **Fecha del fork** | 2026-09-18 |
| **Plan de montaje** | `docs/PLAN_FORK_ZOOM.md` |

---

## 1. Política de portabilidad de cambios

**Los arreglos del núcleo nacen en High y se traen aquí; nunca al revés.**

```bash
git fetch upstream
git log --oneline eee96a9..upstream/develop     # qué hay nuevo en High
git cherry-pick <sha>
```

- `upstream` está en **solo lectura**: su URL de push es `DISABLED`, así que `git push upstream` falla a propósito. Si algún día hay que revertirlo: `git remote set-url --push upstream <url>`.
- Lo específico de Zoom (branding, sedes, cualquier regla de negocio propia) **no vuelve** a High.
- Cada cherry-pick traído se anota en la bitácora de la sección 4 con su `sha` de origen.
- Un fix del núcleo descubierto **aquí** primero: arréglalo en High, y de allá lo traes. Así no se bifurca la lógica común.

---

## 2. Decisiones tomadas

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-09-05 | **Fork independiente** en vez de multi-tenant | lo pidió el cliente priorizando tiempo; se acepta que el clon hereda los bugs actuales y que hay doble mantenimiento |
| 2026-09-15 | La dimensión de **sede** (`locationId`) existe **solo aquí**; en High no se agrega nada | High tiene una sola caja y 78 sesiones históricas sin solapes; Zoom tiene 3 sedes |
| 2026-09-18 | **Meta / WhatsApp se deja para el final** del montaje | no hay afán con las aprobaciones. El dominio sí hay que decidirlo antes, porque la URL del botón "Ver detalle" se quema dentro de la plantilla |
| 2026-09-18 | **Tres bases de datos separadas**: producción, staging y local (Docker) | High comparte base entre dev y staging, lo que obliga a migraciones idempotentes y hace que un `db:reset` local borre lo de QA. El fork es el momento de no heredarlo |
| 2026-09-18 | El repositorio se llama `zoom-crm`; el proyecto de Railway también | — |

### Restricciones heredadas que no se pueden tocar

- **El rol admin debe llamarse exactamente `admin`**: se busca por nombre en 24 archivos.
- **El ambiente de Railway debe llamarse literalmente `staging`**: `backend/railway.toml` tiene `[environments.staging.deploy]`. Si no coincide, el backend arranca como producción y los logs de QA se mezclan con los de producción en Grafana.
- **Una sola réplica del backend**: 9 crons se duplicarían y socket.io no tiene adapter compartido.
- **No correr `npm audit fix` en el backend**: deja dos copias de `cron` y Prisma inconsistente. El frontend sí lo tolera.
- Los nombres de las plantillas de WhatsApp están quemados en `backend/src/modules/whatsapp/whatsapp.service.ts:277-292`. Crearlas en Meta con esos mismos nombres evita tocar código.

---

## 3. Decisiones abiertas

- [ ] **Dominio definitivo.** Bloquea Railway y, sobre todo, las plantillas de Meta.
- [ ] **WhatsApp en staging**: app y número de prueba propios, o sin webhook en QA (aprobaciones desde la UI). El webhook se configura por app de Meta y un WABA se suscribe a una sola app, así que un mismo número no puede servir a producción y a pruebas a la vez.
- [ ] **Workspace de Railway**: se construye dentro del workspace actual y se transfiere ("Transfer Project") cuando entre en producción.
- [ ] **Alcance del inventario entre sedes.** Hay que definirlo antes de escribir la primera migración con `locationId`, porque arrastra pedidos y producción.

---

## 4. Bitácora de divergencias

Formato: fecha · qué cambió · por qué. Los cherry-pick traídos de High se anotan con el `sha` de origen.

| Fecha | Cambio | Detalle |
|---|---|---|
| 2026-09-18 | Fork creado | clon con historia desde `fork-zoom-2026-09`; `origin` → zoom-crm, `upstream` → High (push deshabilitado) |

---

## 5. Punto de no retorno

El **primer commit que introduzca `locationId`** en las entidades del núcleo cierra la puerta a reconverger con High. A partir de ahí, traer un fix del núcleo deja de ser un cherry-pick limpio. Antes de ese commit, revisa que no quede nada del núcleo por arreglar en High: cada fix pendiente se va a pagar dos veces.
