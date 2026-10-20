import { alpha, useTheme } from '@mui/material';

/** Paleta de datos: azul para el tiempo en tareas, neutro para lo demás. */
export const useChartColors = () => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  return {
    data: dark ? '#3987e5' : '#2a78d6',
    idle: alpha(theme.palette.text.primary, dark ? 0.22 : 0.16),
    grid: alpha(theme.palette.text.primary, 0.08),
    text: theme.palette.text.secondary,
    strong: theme.palette.text.primary,
    track: alpha(theme.palette.text.primary, 0.06),
    // Rampa secuencial de un solo tono (de casi nada a todo el tiempo en tareas).
    seq: dark
      ? ['#1c2f52', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6']
      : ['#eef4fc', '#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#184f95'],
  };
};
