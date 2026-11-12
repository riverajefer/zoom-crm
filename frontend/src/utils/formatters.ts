/**
 * Utility functions for formatting data
 */

/**
 * Formatea un valor numérico como moneda colombiana (COP)
 * @param value - Valor numérico o string a formatear
 * @param decimals - Número de decimales a mostrar. Si se omite, muestra los
 *   centavos solo cuando el valor los tiene (1500 → "$ 1.500", 142.85 → "$ 142,85").
 */
export const formatCurrency = (
  value: number | string,
  decimals?: number
): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return '$0';
  }

  const hasCents = Math.round(numValue * 100) % 100 !== 0;
  const fractionDigits = decimals ?? (hasCents ? 2 : 0);

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numValue);
};

/**
 * Aplica redondeo comercial al total de una orden: múltiplo de 50 más cercano
 * (la moneda más pequeña en circulación), así que $94.350 queda igual.
 * - Se truncan los centavos.
 * - Resto contra 50 entre 01–24 → baja; entre 25–49 → sube.
 * Debe coincidir con `applyColombianRounding` del backend.
 */
export const applyColombianRounding = (value: number): number => {
  const truncated = Math.trunc(value);
  const remainder = truncated % 50;
  if (remainder === 0) return truncated;
  if (remainder < 25) return truncated - remainder;
  return truncated + (50 - remainder);
};

/**
 * Redondea el total al peso entero. Se usa cuando hay retenciones, donde el
 * redondeo comercial a múltiplos de 50 distorsionaría la base del certificado
 * de retención, pero dejar centavos tampoco sirve: el cliente paga pesos
 * enteros y el residuo queda como saldo a favor imposible de saldar.
 * Debe coincidir con `roundToWholePeso` del backend.
 */
export const roundToWholePeso = (value: number): number => Math.round(value);

/**
 * Formatea una fecha en formato largo (ej: "15 de enero de 2024")
 * @param date - Fecha en formato string o Date
 */
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};

/**
 * Formatea una fecha en formato corto (ej: "15/01/2024")
 * @param date - Fecha en formato string o Date
 */
export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }

  return new Intl.DateTimeFormat('es-CO').format(d);
};

/**
 * Formatea una fecha y hora (ej: "15 de ene. de 2024, 10:30")
 * @param date - Fecha en formato string o Date
 */
export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

/**
 * Formatea una fecha y hora en formato completo (ej: "15 de enero de 2024, 10:30:45")
 * @param date - Fecha en formato string o Date
 */
export const formatDateTimeFull = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return 'Fecha inválida';
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
};

/**
 * Formatea un número con separador de miles
 * @param value - Valor numérico a formatear
 * @param decimals - Número de decimales (default: 0)
 */
export const formatNumber = (
  value: number | string,
  decimals: number = 0
): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return '0';
  }

  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Formatea un porcentaje
 * @param value - Valor del porcentaje (0-100)
 * @param decimals - Número de decimales (default: 1)
 */
export const formatPercentage = (
  value: number | string,
  decimals: number = 1
): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return '0%';
  }

  return `${numValue.toFixed(decimals)}%`;
};

/**
 * Formatea un decimal de Prisma (string) como número
 * Los decimales vienen del backend como strings para mantener precisión
 * @param decimal - Valor decimal en formato string
 * @param decimals - Número de decimales a mostrar
 */
export const formatDecimal = (
  decimal: string | number,
  decimals: number = 2
): string => {
  const numValue = typeof decimal === 'string' ? parseFloat(decimal) : decimal;

  if (isNaN(numValue)) {
    return '0';
  }

  return numValue.toFixed(decimals);
};

/**
 * Convierte un decimal de Prisma (string) a número
 * @param decimal - Valor decimal en formato string
 */
export const decimalToNumber = (decimal: string): number => {
  const numValue = parseFloat(decimal);
  return isNaN(numValue) ? 0 : numValue;
};

/**
 * Formatea un número de teléfono colombiano
 * @param phone - Número de teléfono
 */
export const formatPhone = (phone: string): string => {
  // Remover caracteres no numéricos
  const cleaned = phone.replace(/\D/g, '');

  // Formato: (###) ###-####
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  // Formato: ### ### ####
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }

  return phone;
};

/**
 * Trunca un texto largo y agrega "..." al final
 * @param text - Texto a truncar
 * @param maxLength - Longitud máxima
 */
export const truncateText = (text: string, maxLength: number = 50): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
};

/**
 * Capitaliza la primera letra de cada palabra
 * @param text - Texto a capitalizar
 */
export const capitalizeWords = (text: string): string => {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Formatea un NIT colombiano
 * @param nit - NIT a formatear
 */
export const formatNIT = (nit: string): string => {
  // Remover caracteres no numéricos excepto el guión
  const cleaned = nit.replace(/[^\d-]/g, '');

  // Si ya tiene el formato correcto (###...###-#), retornarlo
  if (cleaned.includes('-')) {
    return cleaned;
  }

  // Si no tiene guión, agregarlo antes del último dígito (dígito de verificación)
  if (cleaned.length >= 2) {
    return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
  }

  return nit;
};
