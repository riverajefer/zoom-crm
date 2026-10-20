# Propuesta — Reporte de productividad de producción

**Fecha:** 2026-10-20 · **Estado:** fase 1 implementada en `develop` (sin desplegar) · **Depende de:** temporizador de la OT y «Planta hoy»

> **Fase 1, hecha el 2026-10-20:**
> - Endpoint `GET /production-reports/productivity?from&to&areaId&userId&machineId`, con el permiso `read_production_reports`.
> - Página **Producción → Productividad** (`/production-reports`) con tres pestañas:
>   - **Resumen**: indicadores frente al periodo anterior, hallazgos automáticos, horas por día, ocupación por operario y horas por área.
>   - **Operarios**: con ficha (mapa de calor, horas por OT y por máquina).
>   - **Calidad del registro**: suma «tareas fuera de la asistencia», que sirve para detectar entradas o salidas sin marcar.
> - Faltan la fase 2 (costos) y la fase 3 (pestañas OTs y Máquinas, y exportar a Excel).

## 1. Para qué sirve

El cliente quiere **medir la productividad** del personal de producción. «Planta hoy» responde qué está haciendo cada uno *ahora*. Este reporte responde lo que pasó en un periodo:

- ¿Cuánto del tiempo que pago se convierte en trabajo sobre OT?
- ¿Quién, en qué OT y en qué máquinas?
- ¿Cuánto me cuesta cada hora productiva?
- ¿Cuánta mano de obra se llevó cada OT frente a lo que se cobró?

**Límite que hay que decirle al cliente:** todo sale del temporizador. La **ocupación mide tiempo dedicado, no velocidad ni calidad**. Medir unidades por hora exigiría productos estandarizados (ver §7). Además, el mostrador (DTF) no tiene OT, así que quien trabaja ahí sale con baja ocupación aunque esté ocupado todo el día.

## 2. Las métricas

| Métrica | Cómo se calcula | Qué responde |
|---|---|---|
| **Horas en planta** | Suma de la asistencia (entrada → salida) | Tiempo pagado presente |
| **Horas en tareas** | Unión de las tareas dentro de la asistencia; dos a la vez cuentan una vez | Tiempo productivo |
| **Ocupación** | Horas en tareas ÷ horas en planta | ¿Cuánto del tiempo pagado va a OT? |
| **Paralelo** | Suma de tareas ÷ horas en tareas | ¿Aprovecha la máquina mientras hace otra cosa? (1,3× = 1,3 tareas a la vez en promedio) |
| **Horas extra** | Horas en tareas después de las 18:00 | Sobretiempo real trabajado |
| **Costo del periodo** | Salario × días ÷ 30 + horas extra × valor hora × 1,25 | El «costo quincenal» que pidió el cliente: salario + horas extra |
| **Costo por hora productiva** | Costo del periodo ÷ horas en tareas | Cuánto cuesta cada hora en OT. Es el número para comparar personas y quincenas |
| **Mano de obra de la OT** | Horas **prorrateadas** × valor hora; con *k* tareas abiertas, cada una recibe 1/*k* | Costo real de producir la OT; el total cuadra con la nómina |
| **MO / valor** | Mano de obra ÷ valor de la OP | ¿Qué OT se comen la ganancia en mano de obra? |
| **Utilización de máquina** | Horas en uso ÷ 10 h por día hábil | Máquinas ociosas o cuello de botella |
| **Calidad del registro** | Tareas cerradas por el sistema, ajustadas, agregadas y anuladas | ¿Qué tanto confiar en los demás números? |

El **valor hora** es salario ÷ 210 (jornada de 42 h desde julio de 2026). Es un **estimado** hasta que el contador confirme el divisor; la vista lo rotula así.

## 3. La vista

La ruta es **Producción → Reportes de productividad** (`/production-reports`).

**Filtros arriba, fijos al hacer scroll:**
- **Periodo**, con atajos alineados a la nómina: quincena actual, quincena anterior, esta semana, últimos 30 días y personalizado.
- **Área**, **operario** y **máquina**.

Cada indicador se compara con el **periodo anterior de la misma duración**.

**Pestañas:**

1. **Resumen**
   - 6 indicadores: horas en planta, horas en tareas, ocupación, horas extra, OTs con tiempo y costo por hora productiva.
   - **Hallazgos automáticos** en lenguaje simple. Por ejemplo: «Mateo tiene la ocupación más baja», «Mateo olvida finalizar: el 17 % de sus tareas las cerró el sistema», «La OT-0188 se llevó el 51 % de su valor en mano de obra».
   - 4 gráficos: horas por día (en tareas frente a planta sin tarea), ocupación por operario, horas por área y utilización de máquinas.
2. **Operarios**
   - Tabla ordenable: días, en planta, en tareas, ocupación, paralelo, extra, OTs, máquina principal, cerradas por el sistema, costo del periodo y costo por hora productiva.
   - Al hacer clic se abre la **ficha del operario**:
     - mapa de calor día × hora, que muestra *cuándo* trabaja y sus huecos;
     - horas por OT;
     - horas por máquina.
3. **OTs**: horas-persona prorrateadas, personas, días con trabajo, duración (primera a última tarea), mano de obra, valor de la OP y MO / valor con semáforo.
4. **Máquinas**: horas en uso, utilización, OTs, operarios y un mini gráfico de uso por hora del día.
5. **Calidad del registro**: por operario, cerradas por el sistema, ajustadas, agregadas, anuladas, % en planta sin tarea y un nivel de confianza (alta, media o baja).

Al final va el bloque **«Cómo se calcula cada número»**, para que el cliente no tenga que preguntar. También hay un botón **Exportar a Excel**.

La maqueta interactiva muestra todo esto con datos ficticios.

## 4. De dónde salen los datos

Todo ya existe; no hace falta capturar nada nuevo.

- **Tareas:** `work_order_time_entries`, sin las anuladas. Las cerradas por el sistema cuentan, pero se marcan.
- **Asistencia:** `attendance_records`.
- **Salario:** `employees.monthlySalary`, unido por `userId`. Quien no tenga empleado o salario sale sin costo, con un aviso.
- **OT y valor:** `work_orders` → `orders.total`.
- **Máquinas:** `machines`.
- **Área:** el cargo del operario.

## 5. Diseño técnico propuesto

- **Endpoint:** `GET /work-order-time-entries/report?from&to&areaId&userId&machineId`, con un permiso nuevo, `read_production_reports`.
  - El cálculo se hace en el servidor, porque el prorrateo y la unión de intervalos van por operario-día y el periodo puede ser de un mes.
  - Devuelve los agregados de las cinco pestañas más el periodo anterior.
  - Reutiliza la unión de intervalos que ya existe en `features/work-orders/utils/plant.ts`, portada al backend como util compartido con tests.
- **Frontend:** página nueva con los mismos componentes de la app (DataGrid, cards, MUI). Los gráficos van en SVG propio o con `recharts`, que ya está instalado.
- **Exportación:** una hoja por pestaña, con el patrón de `ExportDialog`.
- **Rendimiento:** con unos 1.000 registros al mes por 11 operarios el cálculo es trivial, sin tablas precalculadas.

**Fases sugeridas:**
1. Resumen + Operarios con su ficha + Calidad del registro (sin costos).
2. Costos: valor hora configurable, costo por hora productiva y mano de obra por OT con MO / valor.
3. Máquinas y exportación a Excel.

## 6. Preguntas para el cliente

1. ¿El **divisor de horas** para el valor hora es 210 (42 h semanales)? ¿Las horas extra se pagan al 1,25 (diurnas)?
2. ¿Cuál es el **umbral de MO / valor** que les preocupa? La maqueta usa 15 % para naranja y 30 % para rojo.
3. ¿Marcan salida a almorzar? Si no, el almuerzo cuenta como tiempo en planta y baja la ocupación de todos por igual, unos 45 minutos al día.
4. ¿Quién ve los costos y salarios? Proponemos que el permiso `read_production_reports` muestre todo, y que gerencia sea la única que lo tenga.
5. ¿Qué jornada de máquina usamos para la utilización: 10 h (8:00–18:00) o la real de cada área?

## 7. A futuro: productividad por unidad

La ocupación dice si se trabajó; no dice si se trabajó **rápido**. Para eso hace falta producción por hora, por ejemplo metros de vinilo por hora o camisetas por hora. El sistema ya tiene la cantidad de cada ítem de la OT, pero los productos no están estandarizados (un «pendón» puede ser de 1 m o de 5 m). Cuando el catálogo tenga unidades comparables por área, la ficha del operario puede sumar **unidades por hora frente al promedio del área**.
