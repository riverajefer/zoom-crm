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
git cherry -v develop upstream/develop          # "-" ya aplicado, "+" pendiente
git cherry-pick <sha>
```

⚠️ **No uses `git log eee96a9..upstream/develop` para esto.** El cherry-pick crea un commit nuevo con otro `sha`, así que git nunca da por alcanzado el original de High: ese comando lista como pendiente todo lo que ya trajiste. `git cherry` compara el contenido de cada cambio y sí los reconoce. Su límite: un cherry-pick que hubo que ajustar a mano por un conflicto deja de ser idéntico y sigue saliendo con `+`; para esos está la bitácora de la sección 4.

- `upstream` está en **solo lectura**: su URL de push es `DISABLED`, así que `git push upstream` falla a propósito. Si algún día hay que revertirlo: `git remote set-url --push upstream <url>`.
- Lo específico de Zoom (branding, sedes, cualquier regla de negocio propia) **no vuelve** a High.
- Cada cherry-pick traído se anota en la bitácora de la sección 4 con su `sha` de origen.
- Un fix del núcleo descubierto **aquí** primero: arréglalo en High, y de allá lo traes. Así no se bifurca la lógica común.

### Flujo de ramas (decidido 2026-09-22)

| Salto | Cómo | Por qué |
|---|---|---|
| trabajo → `develop` | push directo | es la rama del día a día |
| `develop` → `staging` | **fast-forward directo**, sin PR | es QA: cada cambio se despliega en pruebas al instante |
| `staging` → `master` | **siempre por PR** | `master` despliega a producción; el hook de pre-push rechaza el push directo |

```bash
# develop → staging
git checkout staging && git merge --ff-only develop && git push && git checkout develop

# staging → master
gh pr create --base master --head staging
```

El `--ff-only` es la red de seguridad del salto directo: si `staging` tuviera algo propio que `develop` no tiene (un hotfix hecho directo ahí), el comando **falla** en vez de crear un merge en silencio. Si falla, hay que traer ese cambio a `develop` primero y volver a intentarlo.

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

- [x] ~~Dominio definitivo~~ → **`zoompublicidadcrm.com`** (confirmado 2026-09-20, registrado en Name.com). Hosts: apex y `www` al frontend, `api.` al backend, `pruebas.` y `api.pruebas.` a staging. Comprado **dentro de Railway**, que gestiona la zona DNS: crea los registros solo al agregar cada dominio a un servicio, apex incluido, así que no hace falta Cloudflare. La zona está vacía y lo que hoy responde es el parking de name.com, no un comodín.
- [ ] **WhatsApp en staging**: app y número de prueba propios, o sin webhook en QA (aprobaciones desde la UI). El webhook se configura por app de Meta y un WABA se suscribe a una sola app, así que un mismo número no puede servir a producción y a pruebas a la vez.
- [ ] **Workspace de Railway**: se construye dentro del workspace actual y se transfiere ("Transfer Project") cuando entre en producción.
- [ ] **Alcance del inventario entre sedes.** Hay que definirlo antes de escribir la primera migración con `locationId`, porque arrastra pedidos y producción.

---

## 4. Bitácora de divergencias

Formato: fecha · qué cambió · por qué. Los cherry-pick traídos de High se anotan con el `sha` de origen.

| Fecha | Cambio | Detalle |
|---|---|---|
| 2026-09-18 | Fork creado | clon con historia desde `fork-zoom-2026-09`; `origin` → zoom-crm, `upstream` → High (push deshabilitado) |
| 2026-09-22 | **Cherry-pick de High** `4d44a66` → `b7adaea` | fix(credit-balance): permitir usar el saldo a favor de OPs anuladas |
| 2026-09-22 | **Cherry-pick de High** `26a9ca6` → `6451f52` | feat(orders): al anular, lo pagado que no retiene la empresa queda como saldo a favor. Trae la migración `20260922000000_status_change_request_retained_amount` (columna nullable, idempotente; su comentario dice que dev y staging comparten base, cierto en High pero no aquí — se deja igual para que el commit sea idéntico). Sin conflictos; tests afectados verdes: 373 backend, 132 frontend |
| 2026-09-22 | Logos y favicon de Zoom | `logo-dark.webp` es el logo original (texto negro) y lo usan **7 generadores de PDF**, que van sobre papel blanco. `logo.png` es el de la interfaz oscura (login y sidebar): se generó invirtiendo los píxeles acromáticos del original para que el texto quede blanco, protegiendo el interior del camaleón con un relleno de huecos para no perderle el ojo ni la boca. El favicon es el camaleón recortado a 256×256 con fondo transparente |
| 2026-09-20 | Guardián de `master` en el pre-push | GitHub solo protege ramas en repos privados con plan Pro, y `zoom-crm` es privado en Free: la protección del servidor quedó inactiva al volverlo privado. `frontend/.husky/pre-push` rechaza ahora el push directo a `master`. **Limitación**: el hook es un archivo versionado, así que vale el de la rama activa — estando en `master` no protege hasta que el guardián llegue allá con el primer merge. Salida de emergencia: `git push --no-verify` |
| 2026-09-20 | Repo pasado a **privado** | se creó público por error; 0 forks y 0 stars mientras lo estuvo. No hubo `.env` reales en la historia (solo `.env.example`), ni volcados de base rastreados |
| 2026-09-18 | Etiqueta de Loki `app` | `backoffice-backend` → **`zoom-backend`** en `backend/src/common/logger/logger.config.ts` (2 sitios). Sin esto, los logs de Zoom y los de High caen en el mismo stream de Grafana y no hay forma de separarlos |
| 2026-09-18 | Rebranding — **solo el nombre** | «High Solutions» → **«Zoom Publicidad CRM»** (nombre comercial confirmado por el cliente) en 14 archivos: título del navegador, Topbar, LoginForm, Sidebar, fallback de `VITE_APP_NAME`, página de mantenimiento, `pdfConstants.ts`, los **4 generadores de PDF**, los 2 mensajes de WhatsApp de OP y cotización, el ejemplo de `create-company.dto`, el ejemplo de `report-client-error.dto` y la empresa demo del seed |

### Pendientes de branding (marcados en el código con `TODO(zoom)`)

| Qué | Dónde | Estado |
|---|---|---|
| Dirección, ciudad, teléfonos, email | `frontend/src/utils/pdfConstants.ts` | valores `PENDIENTE: …` — **salen impresos en todos los PDF** |
| Sitios web del pie de página | los 4 `generate*Pdf.ts` | `PENDIENTE: sitio web` |
| ~~Logos claro y oscuro~~ | `frontend/src/assets/logo.png`, `logo-dark.webp` | ✅ 2026-09-22 |
| ~~Favicon~~ | `frontend/public/favicon.png` | ✅ 2026-09-22 (el camaleón) |
| Dominio en comentarios | `cors-origins.util.ts`, `whatsapp.service.ts:419` | citan `crmhighsolutions.com`; se corrigen cuando exista el dominio |

Los marcadores `PENDIENTE` son deliberados: se ven en QA y evitan que un PDF de Zoom salga con la dirección de otra empresa. **Ninguno puede llegar a producción.**

> Hallazgo: el pie de los PDF **duplica** los datos de `pdfConstants.ts` con literales propios en cada uno de los 4 generadores. Al cargar los datos reales hay que tocar los cinco archivos, no solo el de constantes.

---

## 5. Hallazgos del arranque local (2026-09-18, verificados)

Base nueva en Postgres 17 (Docker, puerto 55432), sin datos de demo:

- **Las 124 migraciones aplican limpio** sobre base vacía; `prisma:drift` en 0 después.
- **Seed con `SEED_DEMO=false`**: 190 permisos, 4 roles, 1 usuario (`adminsistema`), 152 ciudades, 18 áreas de producción, 10 cargos, 14 unidades, 7 canales, 8 consecutivos. Cero clientes, productos, órdenes o cotizaciones.
- **El CLI de Prisma necesita `backend/.env`**, no `.env.development`: `prisma.config.ts` hace `import "dotenv/config"`, que solo carga `.env`. La aplicación NestJS sí lee `.env.<NODE_ENV>`. Hay que mantener el mismo `DATABASE_URL` en los dos.
- ⚠️ **Las variables de S3 son obligatorias para arrancar.** `StorageS3Service` lanza en el constructor si falta cualquiera, y el backend no levanta. En Railway, **el bucket tiene que existir y estar configurado antes del primer deploy del backend**, o el healthcheck falla y el despliegue se cae. WhatsApp, en cambio, degrada con un warning.
- Login verificado de punta a punta: `/health` 200, `POST /auth/login` 200 con rol `admin` y 190 permisos, y el panel carga en el navegador.

## 6. Punto de no retorno

El **primer commit que introduzca `locationId`** en las entidades del núcleo cierra la puerta a reconverger con High. A partir de ahí, traer un fix del núcleo deja de ser un cherry-pick limpio. Antes de ese commit, revisa que no quede nada del núcleo por arreglar en High: cada fix pendiente se va a pagar dos veces.
