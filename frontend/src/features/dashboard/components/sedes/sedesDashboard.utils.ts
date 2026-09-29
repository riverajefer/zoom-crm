import type { Theme } from '@mui/material';

/**
 * Colores de los gráficos del dashboard por sede. Los colores propios de las
 * sedes identifican la sede en chips y encabezados, pero no sirven como paleta
 * de gráfico: son claros y el 119 y el 125 se confunden (validado con la guía de
 * visualización). Por eso las sedes se separan por panel o por etiqueta, y los
 * gráficos usan esta paleta categórica validada, con un paso para cada modo.
 */
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
} as const;

/** Gris neutro para "Otros": no es una categoría más. */
const OTHER = { light: '#8a8984', dark: '#77766f' } as const;

export const chartPalette = (theme: Theme) => CATEGORICAL[theme.palette.mode];
export const otherColor = (theme: Theme) => OTHER[theme.palette.mode];

/** Ventas y gastos: siempre los mismos dos colores, en todos los paneles. */
export const salesExpenseColors = (theme: Theme) => ({
  ventas: chartPalette(theme)[0],
  gastos: chartPalette(theme)[1],
});

/** Variación contra el periodo anterior; `null` si antes no había nada con qué comparar. */
export function changeRatio(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatChange(ratio: number | null): string {
  if (ratio === null) return 'Sin datos del periodo anterior';
  const pct = Math.round(ratio * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} % frente al periodo anterior`;
}

export const formatPercent = (ratio: number | null) => (ratio === null ? '—' : `${Math.round(ratio * 100)} %`);

/** Pesos sin decimales y con separador de miles, para cifras grandes. */
export const formatMoney = (value: number) =>
  `${value < 0 ? '−' : ''}$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
