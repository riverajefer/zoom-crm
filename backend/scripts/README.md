# Scripts de Base de Datos

Scripts para backup y restauración de las bases de datos en Railway (staging y producción).

Las credenciales **no** viven en los scripts: `backup-db.sh` lee `DATABASE_URL`
desde `backend/.env.<ambiente>`. Para respaldar producción hay que completar
antes `backend/.env.production` (Railway → servicio Postgres → Variables →
`DATABASE_PUBLIC_URL`, o `railway login && railway link && railway variables`).

---

## Requisito previo

Necesitas tener `pg_dump` y `psql` instalados:

```bash
# macOS
brew install libpq && brew link --force libpq

# Ubuntu / Debian
sudo apt-get install postgresql-client
```

---

## Crear un backup

**Script:** `backup-db.sh`

Los backups se guardan en `backups/<ambiente>/` con timestamp en el nombre.
El ambiente por defecto es `staging`.

```bash
# Desde la raíz del proyecto:

# Backup completo (schema + data) de staging
./backend/scripts/backup-db.sh

# Backup completo de producción
./backend/scripts/backup-db.sh --env=production

# Solo el schema (estructura de tablas)
./backend/scripts/backup-db.sh --schema

# Solo la data (sin estructura)
./backend/scripts/backup-db.sh --data

# Backup comprimido (.gz)
./backend/scripts/backup-db.sh --compress

# Combinado: producción, comprimido
./backend/scripts/backup-db.sh --env=production --compress
```

`backup-staging.sh` sigue existiendo como alias de `backup-db.sh --env=staging`.

**Ejemplo de archivo generado:**
```
backups/staging/backup_staging_full_20260511_143022.sql
backups/production/backup_production_full_20260511_143022.sql.gz
```

El script aborta si el dump sale vacío, para no dejar un backup inservible que
dé falsa seguridad.

> La carpeta `backups/` está en `.gitignore` — los dumps nunca se commitean.

---

## Restaurar un backup

**Script:** `restore-backup.sh`

> ⚠️ La restauración **sobreescribe** los datos existentes. El script siempre pide confirmación antes de ejecutar.

### Modo interactivo (recomendado)

Muestra la lista de backups disponibles y pregunta el destino:

```bash
./backend/scripts/restore-backup.sh
```

Ejemplo de selección:

```
Backups disponibles en backups/staging:

  [1] backup_staging_full_20260511_150000.sql.gz    1.2M  2026-05-11 15:00:00
  [2] backup_staging_full_20260511_143022.sql        4.8M  2026-05-11 14:30:22
  [3] backup_staging_schema_20260510_090000.sql      120K  2026-05-10 09:00:00

Selecciona un backup [1-3]: 1

¿A qué base de datos restaurar?
  [1] Staging   (Railway)
  [2] URL custom

Selecciona destino [1-2]: 1
```

### Modo directo (con flags)

```bash
# Archivo específico a staging
./backend/scripts/restore-backup.sh \
  --file backups/staging/backup_staging_full_20260511_143022.sql \
  --target staging

# Archivo comprimido
./backend/scripts/restore-backup.sh \
  --file backups/staging/backup_staging_full_20260511_143022.sql.gz \
  --target staging

# URL custom (otra base de datos)
./backend/scripts/restore-backup.sh \
  --file backups/staging/backup_staging_full_20260511_143022.sql \
  --target postgresql://user:pass@host:5432/db
```

### Targets disponibles

| Flag | Base de datos |
|------|---------------|
| `--target staging` | Railway Staging (preconfigurado) |
| `--target production` | Railway Production (requiere completar URL en el script) |
| `--target <URL>` | Cualquier URL de PostgreSQL |

---

## Flujo típico de trabajo

```bash
# 1. Generar backup antes de un cambio riesgoso
./backend/scripts/backup-staging.sh --compress

# 2. Hacer el cambio...

# 3. Si algo salió mal, restaurar el backup más reciente
./backend/scripts/restore-backup.sh
```

---

## Saneamiento de clientes y proveedores duplicados

Dos scripts, en este orden. La separación es a propósito: el detector **no tiene
código de escritura**, así que ningún flag mal escrito puede tocar producción.

### Por qué hace falta revisión humana

Coincidir por documento **no** implica ser el mismo cliente. En producción hay
cédulas compartidas por personas distintas (`Angelica Pachon` / `Paola Pachon`,
`Martha Inés Ramírez` / `SEMTEC`). Y al revés, hay duplicados reales cuyo nombre
no coincide (`DM PROMOCIONALES` / `DM PROMOCIONALES SAS`). Ningún criterio
automático es seguro por sí solo, por eso el reporte se revisa a mano.

En proveedores el NIT **no** se usa como llave: 37 proveedores sin relación entre
sí comparten placeholders como `1111111111` (ACUEDUCTO, ETB, TIGO…). Solo el
nombre distingue.

### Paso 1 — detectar (solo lectura)

```bash
npx ts-node scripts/detect-duplicate-parties.ts --env=staging
```

Opciones: `--entity=clients|suppliers|both`, `--tier=ALTA|ALL`.

Escribe `scripts/.merge-reports/<entidad>-<env>-<timestamp>.csv` (+ un `.md`
legible). El directorio está en `.gitignore`: contiene datos personales.

Niveles de confianza:

| Nivel | Regla | `decision` precargada |
|---|---|---|
| `ALTA` | documento **y** nombre coinciden | `FUSIONAR` |
| `MEDIA` | solo el documento | `OMITIR` |
| `BAJA` | solo el nombre | `OMITIR` |
| `BAJA_FUZZY` | nombres a distancia <= 2 (erratas) | `OMITIR` |

### Paso 2 — revisar el CSV

Edita solo dos columnas: `decision` (`FUSIONAR` / `OMITIR`) e `is_winner` (la `X`
marca el registro que sobrevive). Todo el grupo debe llevar la misma `decision` y
tener exactamente un ganador.

### Paso 3 — fusionar

```bash
npx ts-node scripts/merge-duplicate-parties.ts --env=staging --report=scripts/.merge-reports/<archivo>.csv
```

Sin `--apply` es dry-run: solo cuenta lo que movería. Con `--apply` escribe.
**Haz backup antes** (`./scripts/backup-db.sh --env=production --compress`).

Qué hace por cada grupo, en una transacción:

1. Bloquea las filas y verifica que no cambiaron desde la detección (hash).
2. Escribe la auditoría en `audit_logs` con el snapshot completo de cada perdedor.
3. Repunta `orders`, `quotes`, `dtf_records`, `prospects` al ganador.
4. **Une los asesores**: el ganador queda con los asesores de todos los duplicados
   (`ON CONFLICT DO NOTHING`, porque el `@@unique(clientId, advisorId)` revienta si
   ambos comparten asesor). Nadie pierde su cliente.
5. Rellena los campos vacíos del ganador desde los perdedores. Nunca sobrescribe.
6. Verifica que no quede **ninguna** referencia a los perdedores; si queda alguna,
   revierte el grupo entero. Esta guarda evita que las FK `SET NULL` de proveedores
   vacíen ítems de OG y cuentas por pagar en silencio.
7. Retira a los perdedores: `isActive = false` y `email = NULL` (liberar el email
   evita que quede secuestrado por un registro que ya nadie ve). El borrado duro
   está detrás de `--hard-delete`.

El detector solo mira registros **activos**, así que los perdedores de una fusión
anterior no vuelven a aparecer en el reporte. Y si intentas reaplicar un CSV viejo,
el chequeo de hash lo rechaza: hay que volver a detectar.

### Prevención

La causa raíz está atacada en el código: `POST /clients` y `POST /suppliers`
devuelven **409** con los posibles duplicados en vez de crear a ciegas. En clientes
el frontend ofrece **solicitar co-propiedad** del cliente existente
(`client-advisor-requests`) — que es lo que el asesor realmente busca — o crear
igual con `?force=true`. El criterio lo comparten script y backend en
`src/common/utils/normalize.util.ts`, para que el reporte y el formulario no discrepen.

---

## Traer los catálogos de High a Zoom

**Scripts:** `export-high-catalog.sh` (lee High) + `prisma/import-high-catalog.ts` (escribe en Zoom)

Trae 11 catálogos: unidades de medida, áreas de producción, cargos, canales de
venta, tipos y subcategorías de gasto, categorías de producto, productos,
categorías de insumo, insumos y proveedores. No trae nada transaccional.

```bash
cd backend

# 1. Exportar de High (sesión de SOLO LECTURA). La URL de High no vive en este repo.
HIGH_DATABASE_URL='postgresql://...' ./scripts/export-high-catalog.sh
#    → prisma/data/high-catalog/*.json  (ignorados por git: traen datos de proveedores)

# 2. Simular contra la base destino: reporta nuevos, fusionados, rechazados. No escribe.
DATABASE_URL='postgresql://...destino...' npm run prisma:import:high

# 3. Aplicar
DATABASE_URL='postgresql://...destino...' npm run prisma:import:high -- --apply
```

Pasa siempre `DATABASE_URL` explícito: sin él el script usa el de `backend/.env`,
que puede apuntar a Railway. El destino se imprime antes de empezar.

- **Una sola transacción**: entra todo o nada. La simulación ejecuta lo mismo y
  hace rollback, así que su reporte es exactamente lo que hará `--apply`.
- **Clave natural, no ids**: los padres van por nombre en los JSON. La
  comparación ignora mayúsculas, tildes, espacios sobrantes y la forma Unicode
  (NFC/NFD), así que `Producción`, `produccion` y `Producción ` son uno solo.
- **Duplicados de High se fusionan**: sus hijos quedan bajo el sobreviviente
  (el primero creado en High). El reporte lista cada fusión.
- **Proveedores**: criterio de `normalize.util` — NIT sin dígito de
  verificación, NITs de relleno (`1111111111`…) descartados como llave, nombre
  sin sufijos societarios. Mismo nombre con NIT distinto queda aparte y se avisa.
- **Lo que ya existe en Zoom no se sobrescribe**: solo se llenan campos vacíos.
  Se puede correr varias veces; la segunda no crea nada.
- **Stock de insumos en 0**: es inventario de High. Se conservan precio de
  compra, stock mínimo y factor de conversión.
- **Slugs y SKU/email únicos**: si están ocupados se genera `-2`, o se deja el
  campo vacío, y se avisa.
- Una fila cuyo padre no existe (área, categoría, unidad, ciudad) se **rechaza**
  y se informa; el resto se importa igual.
