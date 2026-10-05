# Checklist de pruebas manuales con sedes

Recorrido a mano, con varios usuarios a la vez, de los flujos principales de Zoom: COT, OP, OT, OG, CP, caja, cambio de sede, modo consulta, vista "Todas", Matriz y apoyo en otra sede.

Complementa el recorrido de aceptación de [PLAN_SEDES.md §12 (fase 8)](./PLAN_SEDES.md#fase-8--aceptación-y-producción): aquel lista los criterios de cada fase; este dice **qué hacer, con quién y en qué orden**.

---

## 0. Preparación

### Ambiente

- [ ] Ambiente elegido: ☐ local (`SEED_DEMO=true`) ☐ staging (`https://pruebas.zoompublicidadcrm.com`)
- [ ] La base está recién sembrada con `SEED_DEMO=true` (si no, los usuarios de sede no existen).
- [ ] `curl -i <API>/health` responde 200.
- [ ] Hay productos y al menos un insumo con stock (los catálogos de High ya están en staging).

### Usuarios (contraseña `zoom123`, salvo `adminsistema`)

| Usuario | Rol | Sedes | Papel en estas pruebas |
|---|---|---|---|
| `adminsistema` | `soporte` | todas + "Todas" | permisos reservados, página oculta de sedes |
| `admin.zoom` | `admin` | todas + "Todas" | aprobaciones, acciones directas, vista "Todas", dashboard, apoyos |
| `contabilidad.lina` | `contabilidad` | Matriz (ve todas) | OG y CP de la Matriz, cajas en solo lectura |
| `asesor.104` | `asesor` | 104 | ventas en el 104, consulta sin poder cambiar |
| `asesor.119` | `asesor` | 119 | ventas en el 119, co-propiedad |
| `asesor.125` | `asesor` | 125 | ventas en el 125 |
| `asesor.apoyo` | `asesor` | 125, 119 | cambio libre de sede |
| `caja.104` / `caja.119` / `caja.125` | `caja` | la suya | caja, aprobación de anticipos, segunda firma de OG y CP |
| `asesorcaja.125` | `asesor_caja` | 125 | vende y maneja la caja a la vez |
| `produccion.119` | `produccion` | 119 | OT, OPROD e insumos |

### Varios usuarios a la vez

El token vive en `localStorage`, que es **uno por origen y por perfil del navegador**: dos pestañas del mismo perfil son el mismo usuario.

- [ ] Una sesión por perfil: perfiles distintos de Chrome, más Firefox, más Safari. Las ventanas de incógnito de Chrome comparten sesión entre sí, así que cuentan como **un** perfil.
- [ ] Propuesta de reparto mínimo (4 a la vez): **A** `admin.zoom` · **B** asesor de turno · **C** caja de turno · **D** el usuario que se esté probando (contabilidad, producción, apoyo).

### Hoja de anotaciones

Anota cada documento que crees; los pasos de más abajo se refieren a ellos por su etiqueta.

| Etiqueta | Número | Sede | Creado por | Nota |
|---|---|---|---|---|
| COT-104-a | | 104 | asesor.104 | |
| COT-125-a | | 125 | asesor.125 | |
| OP-104-a | | 104 | asesor.104 | desde COT-104-a |
| OP-119-a | | 119 | asesor.119 | |
| OP-125-a | | 125 | asesor.125 | |
| OT-119-a | | 119 | | desde OP-119-a |
| OG-104-a | | 104 | admin.zoom | |
| OG-MAT-a | | MAT | contabilidad.lina | |
| Cliente-X | | — | asesor.125 | cliente compartido |

---

## 1. Login y sede activa

Con cada usuario de la tabla:

- [ ] Entra con **username**; con el email da 401.
- [ ] Entra directo a su sede predeterminada; el Topbar muestra la sede con su color (104 violeta, 119 ámbar, 125 coral).
- [ ] Usuario de una sola sede (`asesor.104`, `caja.119`…): el selector no ofrece otras sedes ni "Todas".
- [ ] `admin.zoom`, `adminsistema` y `contabilidad.lina` ven "Todas" en el selector.
- [ ] `contabilidad.lina` entra a la Matriz.
- [ ] Cerrar sesión y volver a entrar conserva la sede predeterminada.
- [ ] Refrescar la página (F5) no pierde la sede activa ni la sesión.

## 2. Cambio de sede

- [ ] `asesor.apoyo`: cambia del 125 al 119 desde el Topbar. Los listados de OP, COT y el tablero se recargan con lo del 119.
- [ ] `asesor.apoyo`: crea una COT estando en el 119 → sale `119-COT-…`. Vuelve al 125 y ya no la ve en el listado.
- [ ] `asesor.apoyo` con un formulario de OP a medio llenar cambia de sede: anota qué pasa (¿se pierde, se advierte, se crea en la sede nueva?).
- [ ] `admin.zoom`: pasa por 104 → 119 → 125 → Matriz → Todas; el menú cambia con la Matriz (§10) y vuelve con los locales.
- [ ] Notificaciones: tras cambiar de sede, una notificación de operación de la sede anterior ya no llega en tiempo real (§13).

## 3. Roles y permisos

- [ ] `admin.zoom` en Roles: **no ve** el rol `soporte` ni sus usuarios en Usuarios.
- [ ] `admin.zoom` edita el rol `admin`: **no aparece** `manage_locations` en la lista de permisos.
- [ ] `admin.zoom` entra a `/sistema/sedes` por URL: sin acceso.
- [ ] `adminsistema` entra a `/sistema/sedes`: ve las 4 sedes con dirección, teléfono y color. **No crees sedes en staging** salvo que sea parte de la prueba.
- [ ] `admin.zoom` en la ficha de un usuario: ve y edita sede predeterminada y sedes permitidas.
- [ ] `admin.zoom` le quita el 119 a `asesor.apoyo`. En la sesión abierta de `asesor.apoyo`, la siguiente acción en el 119 lo devuelve a una sede permitida sin quedarse colgado. Devuélvele el 119 al terminar.
- [ ] Menú por rol: `asesor.104` no ve Caja; `caja.104` sí puede crear COT, OP y OG (copia del rol de High); `produccion.119` ve OT/OPROD/insumos y no ve pagos.

## 4. Clientes

- [ ] `asesor.125` crea **Cliente-X** (anota su documento).
- [ ] `asesor.119` intenta crear un cliente con el mismo documento: la alerta de duplicado dice el **asesor y la sede** (125).
- [ ] `asesor.119` pide co-propiedad; `admin.zoom` la aprueba; `asesor.119` ya puede usar Cliente-X en una COT u OP del 119.
- [ ] Los clientes son comunes: `asesor.104` encuentra a Cliente-X en el buscador.

## 5. Cotizaciones (COT)

### Creación y numeración
- [ ] `asesor.104` crea **COT-104-a** y `asesor.125` crea **COT-125-a**, casi al mismo tiempo. Salen `104-COT-…` y `125-COT-…` con números seguidos y distintos: el contador es global, no por sede (si una sale `104-COT-0007`, la otra es `125-COT-0008`).
- [ ] `asesor.104` no ve COT-125-a en su listado ni en el tablero, y viceversa.
- [ ] El PDF de COT-104-a sale con la dirección y el teléfono del 104; el de COT-125-a, con los del 125.

### Estados y tablero
- [ ] Mueve COT-104-a por el tablero: Borrador → Enviada → Seguimiento 1 → … El arrastre funciona y persiste al refrescar.
- [ ] Rechaza una COT (pide motivo). Queda terminal.
- [ ] `asesor.104` pide restaurarla; `admin.zoom` aprueba y vuelve al estado anterior.
- [ ] Una COT en Sin respuesta / Aceptada se comporta como se espera en el tablero.

### Conversión
- [ ] `asesor.104` convierte COT-104-a en **OP-104-a**: la OP sale `104-OP-…` y la COT queda Convertida.
- [ ] `asesor.apoyo` estando en el 119 abre una COT del 125: modo consulta (§11), no la puede convertir.

## 6. Órdenes de pedido (OP)

### Creación
- [ ] `asesor.119` crea **OP-119-a** directa (sin COT), con Cliente-X (co-propiedad del paso 4).
- [ ] `asesor.125` crea **OP-125-a**.
- [ ] Los números `104-OP-…`, `119-OP-…`, `125-OP-…` corren en paralelo sin saltos.
- [ ] Los listados de cada asesor solo muestran su sede; el mini dashboard (recaudo del periodo) también.

### Anticipo y aprobación de Caja
- [ ] `asesor.119` registra un **anticipo** en OP-119-a → queda pendiente de aprobación por Caja; la OP no deja cambiar de estado mientras tanto (mensaje claro).
- [ ] La aprobación le llega a `caja.119` (campana) y **no** a `caja.104` ni `caja.125`.
- [ ] `caja.119` la aprueba. El pago cae en la caja **del 119** (ver §9).
- [ ] Repite con `caja.119` rechazando: la OP queda sin anticipo y desbloqueada.

### Descuento
- [ ] `asesor.125` aplica un descuento a OP-125-a → pide aprobación; `admin.zoom` la recibe con la sede en el mensaje y la aprueba.
- [ ] `admin.zoom` aplica un descuento directo en otra OP: pide **motivo** y aparece en el historial como "Hecho directamente por el admin".

### Estados
- [ ] Lleva OP-104-a por Confirmada → En producción → Lista → Entregada → Pagada (con los pagos necesarios).
- [ ] Un asesor pide un cambio de estado que requiere solicitud; `admin.zoom` lo aprueba.
- [ ] `admin.zoom` **entrega a crédito** directo: pide motivo, queda en el historial.
- [ ] `admin.zoom` **anula** una OP con pagos: pide motivo y qué retiene la empresa; queda en el historial.

### Edición y asesor
- [ ] `asesor.104` intenta editar una OP confirmada → pide solicitud de edición; `admin.zoom` aprueba; hay ventana de 5 min para editar.
- [ ] `admin.zoom` edita una OP bloqueada: abre la edición con motivo (ventana de 30 min).
- [ ] `asesor.104` pide **cambio de asesor**; `admin.zoom` aprueba.
- [ ] `admin.zoom` cambia el asesor directo: motivo obligatorio, aparece en el historial.

### Pagos y dinero entre sedes
- [ ] **Abono cruzado**: `asesor.apoyo` en el 125 busca OP-119-a → solo consulta, sin botón de pago.
- [ ] `admin.zoom` con el **104 activo** registra un pago en OP-119-a: entra a la caja del **119**, no a la del 104.
- [ ] Edición de un pago: el asesor la hace directo (tiene `edit_order_payments`, como el Comercial de High); queda en el historial de la OP.
- [ ] Anulación de un pago: el asesor la pide; se aprueba; el movimiento de caja queda anulado y el saldo de la OP vuelve.
- [ ] **Devolución** (OP pagada de más o anulada): el asesor la solicita y `admin.zoom` la aprueba y la ejecuta (`caja` ya no tiene `approve_refunds` ni `execute_refunds`, como en High); sale de la caja del 119.
- [ ] **Saldo a favor entre sedes**: Cliente-X queda con saldo a favor en el 119 (por devolución a saldo o pago de más). `asesor.125` lo aplica en OP-125-a. No mueve efectivo en ninguna caja; en el dashboard cuenta en el 125 como "saldo a favor aplicado".

### PDF y tirilla
- [ ] PDF y tirilla de OP-104-a: dirección y teléfono del 104. Los de OP-119-a: los del 119.
- [ ] El recibo de caja (RC) sale `119-RC-…` con los datos del 119.

## 7. Órdenes de trabajo (OT) y producción

- [ ] `asesor.119` crea **OT-119-a** desde OP-119-a: sale `119-OT-…` (hereda la sede de la OP).
- [ ] `produccion.119` la ve; `asesor.104` no la ve en su listado.
- [ ] `produccion.119` la lleva por Confirmada → En producción → Completada.
- [ ] `produccion.119` registra **insumos** en un ítem: el stock baja y el movimiento de inventario queda con sede 119.
- [ ] Registro de tiempos (time entries) en la OT.
- [ ] `produccion.119` crea una OPROD desde la OP: sale `119-OPROD-…`.
- [ ] Desde la OT se navega a su OP y viceversa.
- [ ] `asesor.104` abre OT-119-a por URL: modo consulta, sin acciones.
- [ ] Entrada manual de inventario hecha con el 104 activo: el movimiento queda en el 104; el stock es el mismo para todos.

## 8. Órdenes de gasto (OG) y cuentas por pagar (CP)

Flujo de OG: Borrador → Creada → **Autorizada por admin** (primera firma) → **Caja autoriza** (segunda firma: registra el egreso y queda Pagada). Toda OG crea su CP al nacer.

### OG de un local
- [ ] `admin.zoom` con el 104 activo crea **OG-104-a**: sale `104-OG-…`. Al crearla nace su CP `104-CP-…`.
- [ ] `admin.zoom` la autoriza (primera firma).
- [ ] La segunda firma le aparece a `caja.104`, no a `caja.119`.
- [ ] `caja.104` la autoriza: el egreso cae en la caja del 104 (debe estar abierta) y la OG queda Pagada.
- [ ] Repite con `caja.104` **rechazando**: la OG vuelve a Creada.
- [ ] Con la caja del 104 cerrada, la segunda firma falla con mensaje claro.
- [ ] Un usuario sin admin pide la primera autorización por solicitud; `admin.zoom` la aprueba.

### OG y CP de la Matriz
- [ ] `contabilidad.lina` con la Matriz activa crea **OG-MAT-a**: sale `MAT-OG-…` y su CP `MAT-CP-…`.
- [ ] `admin.zoom` la autoriza. Para la segunda firma la caja de la Matriz tiene que estar abierta: anota **quién la abre** (`contabilidad.lina` no tiene `open_cash_session` en el seed).
- [ ] Tipo de gasto: crear "Producción" cuando ya existe "PRODUCCIÓN" se rechaza (mayúsculas y tildes).

### CP
- [ ] Abono a una CP: requiere la firma de Caja (`caja_authorize_ap_payment`) y sale de la caja de la sede de la CP.
- [ ] Reversión de un abono: se pide, gerencia aprueba, Caja confirma.
- [ ] Listado de CP con el 104 activo no muestra las del 119 ni las de la Matriz.

## 9. Caja

### Apertura simultánea
- [ ] `caja.104`, `caja.119` y `caja.125` abren su caja **a la vez**, cada uno con su base. Ninguno ve la sesión de otro.
- [ ] `caja.104` intenta abrir la caja del 119 (por URL o API): 404.
- [ ] Abrir una segunda sesión en la misma caja se rechaza.

### Movimientos
- [ ] Los pagos del §6 aparecen en la caja de **su** sede, con su recibo.
- [ ] Movimientos manuales en cada caja: ingreso, egreso, retiro (`WITHDRAWAL`) y depósito.
- [ ] Anular un movimiento: `caja.119` lo anula o lo pide; queda registrado.

### Pendientes con la caja cerrada
- [ ] Con la caja del 125 **cerrada**, `asesor.125` registra un pago: queda en la cola de pendientes.
- [ ] `caja.125` abre: entran los pendientes **del 125**, no los de otras sedes.

### Cierre
- [ ] Cada caja cierra con su conteo por denominaciones; el esperado de cada una solo suma sus movimientos.
- [ ] Un cierre con diferencia registra la diferencia y la nota.
- [ ] El reporte de cierre (PDF/Excel) sale con los datos de la sede de la caja.
- [ ] Historial de sesiones: el filtro por fecha usa el día de Bogotá (prueba una sesión abierta después de las 7 p. m.).

### Solo lectura
- [ ] `contabilidad.lina` en "Todas" ve las cajas de las 4 sedes, sin botones de abrir, cerrar ni mover.

## 10. La Matriz

- [ ] `contabilidad.lina` (o `admin.zoom` con la Matriz activa): el menú "Comercial" se llama "Gastos" y solo trae OG, tipos y subcategorías de gasto y CP. No hay COT, OP, OT, DTF, clientes ni producción.
- [ ] `admin.zoom` con la Matriz activa va a crear una OP: le pregunta "¿En qué local se crea?" y solo ofrece 104, 119 y 125.
- [ ] Forzar la creación con la Matriz activa por API da 400 `LOCATION_NOT_A_STORE`.
- [ ] La vista "Todas" de OP, COT, OT y el tablero no muestran la Matriz.

## 11. Modo consulta (otra sede)

Con `asesor.104` (no tiene el 119) y `asesor.apoyo` (sí lo tiene, estando en el 125):

### Puntos de entrada
- [ ] **Ficha del cliente**: Cliente-X muestra sus OP y COT agrupadas por sede, la activa primero, cada grupo con su color.
- [ ] **Buscador**: en el listado de OP del 104 busca el número de OP-119-a → "No está en el Local 104, pero hay resultados en otras sedes" debajo de la tabla, sin mezclar filas.
- [ ] Mismo buscador en COT y OT.
- [ ] **URL directa** a OP-119-a: abre en consulta, no da 403.

### La vista
- [ ] Banner fijo con el color del 119, "Solo consulta" y el **teléfono del 119**.
- [ ] Se ven estado, timeline, ítems, entrega, total, abonado, saldo, asesor y documentos relacionados (que también abren en consulta).
- [ ] **No hay** botones de pago, estado, editar, anular, descuento, devolución ni crear OT.
- [ ] El PDF se descarga con los datos del 119.
- [ ] `asesor.104` **no** ve "Cambiar al Local 119".
- [ ] `asesor.apoyo` **sí** lo ve; al pulsarlo cambia de sede y la OP abre con todas sus acciones.
- [ ] `admin.zoom` **nunca** ve el modo consulta: abre OP-119-a con el 104 activo y tiene todas las acciones.
- [ ] `adminsistema` en Auditoría ve las filas `CONSULTA` de esos accesos.

## 12. Vista "Todas" (admin)

- [ ] `admin.zoom` en "Todas", listado de OP: una tabla por sede (104, 119, 125), encabezado con color, cantidad y subtotal; cada grupo se pliega.
- [ ] Máximo 10 filas por grupo y "Ver las N del Local X", que entra a esa sede.
- [ ] Ordenar por fecha ordena **dentro** de cada grupo; nunca se intercalan filas de sedes distintas.
- [ ] Un filtro (estado, cliente) se aplica en cada grupo.
- [ ] Selector rápido `Todas · 104 · 119 · 125 · Matriz` arriba de OP, COT, OT y el tablero.
- [ ] Tablero de COT: las mismas columnas, un carril por sede; arrastrar dentro de un carril funciona y una COT no se pasa a otro carril.
- [ ] Crear OP, COT, OG, CP o DTF desde "Todas" pregunta primero la sede.
- [ ] `asesor.104` intenta "Todas" (por API con `X-Location-Id: all`): 403.

## 13. Notificaciones y tiempo real

- [ ] Una OP del 119 que cambia de estado notifica a los usuarios del 119 (`asesor.119`, `caja.119`, `produccion.119`, `asesor.apoyo`) y **no** a los del 104 ni del 125.
- [ ] Las de aprobación (anticipo, descuento, edición, devolución) llegan al admin con la sede en el mensaje.
- [ ] `admin.zoom` no recibe las de operación.
- [ ] La campana de aprobaciones de `admin.zoom` suma las pendientes de todas las sedes.
- [ ] Con dos perfiles abiertos, una acción en uno se refleja en el otro sin refrescar (socket).

## 14. Apoyo en otra sede

Con `admin.zoom` (Gerencia), `asesor.104` y `caja.119`:

- [ ] `admin.zoom` en **Apoyos entre sedes** programa a `asesor.104` en el 125 para hoy, con motivo.
- [ ] `asesor.104` recibe la notificación. Al entrar (o en vivo) queda en el 125 con el banner: dónde, quién autorizó, hasta cuándo.
- [ ] El Topbar de `asesor.104` solo muestra el 125 y "Pedir cambio de sede"; no puede volver al 104 solo.
- [ ] `asesor.104` crea una OP: sale `125-OP-…` y suma en las ventas del 125 y en las suyas.
- [ ] Le llegan las notificaciones de operación del 125 y no las del 104.
- [ ] `admin.zoom` intenta programarle otro apoyo que se cruza: se rechaza.
- [ ] `asesor.104` pide volver al 104; `admin.zoom` lo aprueba; la pantalla de `asesor.104` cambia sola al 104 con un aviso.
- [ ] `caja.119` pide apoyo en el 125 para hoy; `admin.zoom` lo aprueba; `caja.119` abre la caja del 125.
- [ ] Aprobarle a `caja.119` volver al 119 con la caja abierta falla con `CASH_SESSION_OPEN`; después de cerrarla, funciona.
- [ ] Rechazar y cancelar solicitudes: el solicitante ve el resultado en "Mis solicitudes de sede".
- [ ] Pestañas Pendientes · Vigentes · Programados · Historial cuadran con lo hecho; un apoyo programado para mañana aparece en Programados y no da acceso hoy.
- [ ] La ficha del usuario muestra el historial de sus apoyos.
- [ ] `asesor.apoyo` sigue cambiando libremente entre 125 y 119 (sin apoyo vigente).

## 15. Dashboard por sede

Al final, cuando ya hay datos conocidos del día:

- [ ] `admin.zoom` abre **Dashboard por sede** con el periodo "hoy".
- [ ] Ventas y número de OP de cada sede cuadran con el listado de OP de esa sede (sin anuladas).
- [ ] Recaudo de cada sede cuadra con el mini dashboard de su listado; el saldo a favor aplicado va en línea aparte (en el 125, por el paso del §6).
- [ ] Gastos: OG-104-a en el 104; OG-MAT-a en la columna Matriz, sin repartir.
- [ ] Clic en una cifra lleva al listado filtrado por esa sede y periodo.
- [ ] Consumo de insumos: los del §7 aparecen en el 119.
- [ ] `asesor.104` no tiene acceso al Dashboard por sede.

## 16. Otros módulos con sede

- [ ] **DTF**: `asesor.125` crea un registro DTF UV y uno textil: `125-DTF-UV-…` y `125-DTF-TEXTIL-…`. Convertirlo en OP hereda el 125.
- [ ] **Asistencia**: `asesor.apoyo` marca entrada estando en el 119; el registro queda en el 119 aunque su nómina sea del 125.
- [ ] **Empleados**: los usuarios de sede existen como empleados de su sede predeterminada.
- [ ] **Adjuntos**: subir y descargar un archivo en una OP (prueba que S3 funciona en el ambiente).
- [ ] **Exportar a Excel**: un listado de OP con una sede activa solo exporta esa sede.

## 17. Pruebas por API (opcionales)

Para confirmar que el backend rechaza aunque la UI se equivoque. Toma el token de `localStorage` del perfil del usuario y el id de la sede desde `GET /sedes` o la ficha.

Header de una sede no permitida → 403 `LOCATION_NOT_ALLOWED`:

```bash
curl -s -H "Authorization: Bearer $TOKEN_ASESOR_104" -H "X-Location-Id: $ID_SEDE_119" "$API/orders?limit=1"
```

"Todas" sin `view_all_locations` → 403:

```bash
curl -s -H "Authorization: Bearer $TOKEN_ASESOR_104" -H "X-Location-Id: all" "$API/orders?limit=1"
```

Escribir sobre una OP de otra sede → 404 (el estado no cambia):

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN_ASESOR_104" -H "X-Location-Id: $ID_SEDE_104" -H "Content-Type: application/json" -d '{"status":"CONFIRMED"}' "$API/orders/$ID_OP_119/status"
```

- [ ] Las tres responden como se espera.

## 18. Asesor y caja, verificación contable y sede al crear usuario

### Una persona, dos papeles
- [ ] `asesorcaja.125` abre la caja del 125, crea una OP, registra un abono y **lo aprueba** en la bandeja de Caja. El pago cae en la caja del 125.
- [ ] El mismo usuario cierra su caja con el arqueo.

### Verificación de pagos (contabilidad)
- [ ] `contabilidad.lina`, parada en la Matriz, entra a **Caja → Verificación de Pagos** y ve los pagos aprobados de **las tres sedes**, con la sede de cada uno.
- [ ] Un abono que Caja aún no aprueba **no** aparece; tampoco los anulados ni los de saldo a favor.
- [ ] Filtra por sede, fecha, método y "recibido por"; busca por número de OP y por cliente.
- [ ] Abre el comprobante de un pago que lo tenga.
- [ ] **Verifica** un pago: pasa a "Verificados" y los contadores de las pestañas cambian.
- [ ] Selecciona varios y usa **Verificar seleccionados**.
- [ ] **Observa** un pago: sin motivo no deja; con motivo pasa a "Observados".
- [ ] El aviso de la observación le llega a quien recibió el pago y a la caja **de esa sede** (no a las otras cajas).
- [ ] En la OP, el Historial de Pagos muestra «Contabilidad: Observado» con el motivo; el saldo de la OP **no cambió**.
- [ ] La sede edita el pago observado → vuelve a "Pendientes" y el historial de verificación (reloj) muestra la observación y la reapertura.
- [ ] `asesor.104` y `caja.104` no ven el menú, y `/verificacion-pagos` les niega el acceso.

### Sede en el formulario de usuario
- [ ] `admin.zoom` crea un usuario eligiendo **Local 104**: en la ficha aparece el 104 como sede permitida y predeterminada, y el usuario entra directo a esa sede.
- [ ] Crea otro con "Sin sede": queda sin sedes, como antes.
- [ ] Al **editar** un usuario el campo no aparece (las sedes se cambian en la ficha).

## 19. Cierre de la sesión de pruebas

- [ ] Todas las cajas quedaron cerradas.
- [ ] `asesor.apoyo` conserva 125 y 119; no quedan apoyos vigentes de prueba que estorben la siguiente ronda.
- [ ] Invariantes (`backend/scripts/sql/invariants.sql`, solo lectura) siguen en 0.

---

## Hallazgos

| # | Sección | Usuario / sede | Pasos | Esperado | Obtenido | Gravedad |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
