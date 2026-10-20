import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import type { ProductivityReport } from '../../../types/work-order-time.types';
import { userName } from './timeline';
import { confidenceLevel } from './productivity';

/**
 * Exportación del reporte de productividad a Excel: una hoja por pestaña. Las
 * horas van como número decimal y los porcentajes de 0 a 100, para que el
 * cliente pueda sumar, filtrar y graficar en Excel sin convertir texto.
 */

type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

const HOUR = 3_600_000;
const hours = (ms: number) => Math.round((ms / HOUR) * 100) / 100;
const pct = (ratio: number | null | undefined) => (ratio == null ? null : Math.round(ratio * 1000) / 10);
const money = (v: number | null | undefined) => (v == null ? null : Math.round(v));
const day = (d: string | null) => (d ? format(parseISO(d), 'dd/MM/yyyy') : null);
const CONFIDENCE = { high: 'Alta', medium: 'Media', low: 'Baja' } as const;

export const buildProductivitySheets = (report: ProductivityReport, filtersLabel: string): Sheet[] => {
  const t = report.totals;
  const p = report.previous.totals;
  const costs = report.costs;
  const sheets: Sheet[] = [];

  const summary: Cell[][] = [
    ['Reporte de productividad de producción'],
    ['Periodo', `${day(report.from)} – ${day(report.to)}`],
    ['Periodo anterior', `${day(report.previous.from)} – ${day(report.previous.to)}`],
    ['Filtros', filtersLabel],
    [],
    ['Indicador', 'Periodo', 'Periodo anterior'],
    ['Horas en planta', hours(t.plantMs), hours(p.plantMs)],
    ['Horas en tareas', hours(t.busyMs), hours(p.busyMs)],
    ['Ocupación (%)', pct(t.occupancy), pct(p.occupancy)],
    ['Horas extra', hours(t.extraMs), hours(p.extraMs)],
    ['OTs con tiempo registrado', t.workOrders, p.workOrders],
    ['Tareas cerradas por el sistema', t.closedBySystem, p.closedBySystem],
  ];
  if (costs && t.cost) {
    summary.push(
      ['Costo del periodo (COP, estimado)', money(t.cost.periodCost), money(p.cost?.periodCost)],
      ['Costo por hora productiva (COP, estimado)', money(t.cost.costPerProductiveHour), money(p.cost?.costPerProductiveHour)],
      ['Mano de obra en OT (COP, estimado)', money(t.cost.laborCost), money(p.cost?.laborCost)],
      ['Operarios sin salario en nómina', t.cost.operatorsWithoutSalary, null],
      [],
      ['Valor hora = salario ÷', costs.hourlyDivisor, 'horas al mes'],
      ['Recargo de la hora extra', costs.overtimeFactor, null],
    );
  }
  sheets.push({ name: 'Resumen', rows: summary });

  sheets.push({
    name: 'Operarios',
    rows: [
      [
        'Operario',
        'Cargo',
        'Área',
        'Días',
        'Horas en planta',
        'Horas en tareas',
        'Ocupación (%)',
        'Paralelo (×)',
        'Horas extra',
        'OTs',
        'Máquina principal',
        ...(costs ? ['Valor hora (COP)', 'Costo del periodo (COP)', 'Costo por hora productiva (COP)'] : []),
      ],
      ...report.operators.map((r) => [
        userName(r.user),
        r.user.cargo?.name ?? null,
        r.user.cargo?.productionArea?.name ?? null,
        r.daysWorked,
        hours(r.plantMs),
        hours(r.busyMs),
        pct(r.occupancy),
        r.parallel == null ? null : Math.round(r.parallel * 100) / 100,
        hours(r.extraMs),
        r.workOrders.length,
        r.machines[0]?.name ?? null,
        ...(costs
          ? [money(r.cost?.hourlyRate), money(r.cost?.periodCost), money(r.cost?.costPerProductiveHour)]
          : []),
      ]),
    ],
  });

  sheets.push({
    name: 'OTs',
    rows: [
      [
        'OT',
        'Cliente',
        'Horas-persona (prorrateadas)',
        'Personas',
        'Días con trabajo',
        'Primer día',
        'Último día',
        ...(costs ? ['Mano de obra (COP)', 'Venta sin IVA (COP)', 'MO / venta (%)', 'Costo parcial'] : []),
      ],
      ...report.workOrders.map((w) => [
        w.workOrderNumber,
        w.client,
        hours(w.personMs),
        w.people,
        w.days,
        day(w.firstDay),
        day(w.lastDay),
        ...(costs ? [money(w.laborCost), money(w.saleValue), pct(w.laborShare), w.costIncomplete ? 'Sí' : 'No'] : []),
      ]),
    ],
  });

  sheets.push({
    name: 'Máquinas',
    rows: [
      ['Máquina', 'Área', 'Horas en uso', 'Utilización (%)', 'OTs', 'Operarios'],
      ...report.machines.rows.map((m) => [
        m.name,
        m.area?.name ?? null,
        hours(m.useMs),
        pct(m.utilization),
        m.workOrders,
        m.operators,
      ]),
      [],
      ['Horas por día hábil', report.machines.dailyHours],
      ['Días hábiles en el periodo', report.machines.workingDays],
      ['Horas de tareas sin máquina', hours(report.machines.withoutMachineMs)],
    ],
  });

  sheets.push({
    name: 'Calidad del registro',
    rows: [
      [
        'Operario',
        'Tareas',
        'Cerradas por el sistema',
        'Ajustadas',
        'Agregadas a mano',
        'Anuladas',
        'En planta sin tarea (%)',
        'Horas de tareas fuera de asistencia',
        'Confianza',
      ],
      ...report.operators.map((r) => [
        userName(r.user),
        r.quality.entries,
        r.quality.closedBySystem,
        r.quality.adjusted,
        r.quality.added,
        r.quality.voided,
        r.plantMs ? pct(r.quality.unregisteredMs / r.plantMs) : null,
        hours(r.quality.outsideAttendanceMs),
        r.quality.entries ? CONFIDENCE[confidenceLevel(r.quality)] : 'Sin tareas',
      ]),
    ],
  });

  sheets.push({
    name: 'Por día',
    rows: [
      ['Fecha', 'Horas en planta', 'Horas en tareas', 'Ocupación (%)'],
      ...report.daily.map((d) => [
        day(d.date),
        hours(d.plantMs),
        hours(d.busyMs),
        pct(d.plantMs ? d.busyMs / d.plantMs : null),
      ]),
    ],
  });

  return sheets;
};

/** Descarga el libro `productividad_AAAA-MM-DD_AAAA-MM-DD.xlsx`. */
export const exportProductivityReport = (report: ProductivityReport, filtersLabel: string) => {
  const wb = XLSX.utils.book_new();
  for (const sheet of buildProductivitySheets(report, filtersLabel)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    const widths = sheet.rows.reduce<number[]>((acc, row) => {
      row.forEach((cell, i) => {
        acc[i] = Math.max(acc[i] ?? 8, Math.min(48, String(cell ?? '').length + 2));
      });
      return acc;
    }, []);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `productividad_${report.from}_${report.to}.xlsx`);
};
