import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  applyColombianRounding,
  roundToWholePeso,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDateTimeFull,
  formatNumber,
  formatPercentage,
  formatDecimal,
  decimalToNumber,
  formatPhone,
  truncateText,
  capitalizeWords,
  formatNIT,
} from './formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('formatea un número como COP con el símbolo y separador de miles', () => {
      const result = formatCurrency(1000000);
      expect(result).toContain('$');
      // es-CO usa punto como separador de miles
      expect(result.replace(/\s| /g, '')).toContain('1.000.000');
    });

    it('acepta strings numéricos', () => {
      expect(formatCurrency('2500').replace(/\s| /g, '')).toContain('2.500');
    });

    it('devuelve $0 para valores no numéricos', () => {
      expect(formatCurrency('abc')).toBe('$0');
      expect(formatCurrency(NaN)).toBe('$0');
    });
  });

  describe('applyColombianRounding', () => {
    it('deja intacto un múltiplo exacto de 50', () => {
      expect(applyColombianRounding(1000)).toBe(1000);
      expect(applyColombianRounding(94350)).toBe(94350);
    });

    it('redondea hacia abajo cuando el resto contra 50 es 01–24', () => {
      expect(applyColombianRounding(1001)).toBe(1000);
      expect(applyColombianRounding(1024)).toBe(1000);
      expect(applyColombianRounding(1060)).toBe(1050);
    });

    it('redondea hacia arriba cuando el resto contra 50 es 25–49', () => {
      expect(applyColombianRounding(1025)).toBe(1050);
      expect(applyColombianRounding(1049)).toBe(1050);
      expect(applyColombianRounding(1080)).toBe(1100);
    });

    it('trunca los decimales antes de redondear', () => {
      expect(applyColombianRounding(1024.9)).toBe(1000);
      expect(applyColombianRounding(1025.1)).toBe(1050);
    });
  });

  describe('roundToWholePeso', () => {
    it('elimina los centavos que dejan las retenciones', () => {
      // Caso real (OP-2026-1644): 442.500 + 84.075 IVA - 11.062,50 retefuente.
      expect(roundToWholePeso(515512.5)).toBe(515513);
      expect(roundToWholePeso(83671331.68)).toBe(83671332);
    });

    it('deja intacto un valor que ya es peso entero', () => {
      expect(roundToWholePeso(1026306)).toBe(1026306);
    });
  });

  describe('formatos de fecha', () => {
    const valid = '2026-01-15T10:30:45';

    it('formatea fechas válidas como string no vacío', () => {
      expect(formatDate(valid)).toContain('2026');
      expect(formatDateShort(valid)).toContain('2026');
      expect(formatDateTime(valid)).toContain('2026');
      expect(formatDateTimeFull(valid)).toContain('2026');
    });

    it('acepta objetos Date', () => {
      expect(formatDate(new Date(valid))).toContain('2026');
    });

    it('devuelve "Fecha inválida" para fechas no parseables', () => {
      expect(formatDate('no-es-fecha')).toBe('Fecha inválida');
      expect(formatDateShort('no-es-fecha')).toBe('Fecha inválida');
      expect(formatDateTime('no-es-fecha')).toBe('Fecha inválida');
      expect(formatDateTimeFull('no-es-fecha')).toBe('Fecha inválida');
    });
  });

  describe('formatNumber', () => {
    it('formatea con separador de miles', () => {
      expect(formatNumber(1234567).replace(/\s| /g, '')).toContain('1.234.567');
    });

    it('devuelve 0 para valores no numéricos', () => {
      expect(formatNumber('xyz')).toBe('0');
    });
  });

  describe('formatPercentage', () => {
    it('formatea con un decimal por defecto', () => {
      expect(formatPercentage(25)).toBe('25.0%');
    });

    it('respeta el número de decimales', () => {
      expect(formatPercentage(33.333, 2)).toBe('33.33%');
    });

    it('devuelve 0% para valores no numéricos', () => {
      expect(formatPercentage('abc')).toBe('0%');
    });
  });

  describe('formatDecimal / decimalToNumber', () => {
    it('formatea un decimal con 2 posiciones por defecto', () => {
      expect(formatDecimal('19.5')).toBe('19.50');
      expect(formatDecimal(8)).toBe('8.00');
    });

    it('formatDecimal devuelve 0 para valores no numéricos', () => {
      expect(formatDecimal('abc')).toBe('0');
    });

    it('decimalToNumber convierte string a número', () => {
      expect(decimalToNumber('12.5')).toBe(12.5);
    });

    it('decimalToNumber devuelve 0 ante un string inválido', () => {
      expect(decimalToNumber('abc')).toBe(0);
    });
  });

  describe('formatPhone', () => {
    it('formatea un celular de 10 dígitos', () => {
      expect(formatPhone('3001234567')).toBe('(300) 123-4567');
    });

    it('formatea un número de 9 dígitos', () => {
      expect(formatPhone('300123456')).toBe('300 123 456');
    });

    it('devuelve el original si no tiene 9 ni 10 dígitos', () => {
      expect(formatPhone('123')).toBe('123');
    });
  });

  describe('truncateText', () => {
    it('no trunca textos cortos', () => {
      expect(truncateText('hola', 50)).toBe('hola');
    });

    it('trunca y agrega puntos suspensivos', () => {
      expect(truncateText('abcdef', 3)).toBe('abc...');
    });
  });

  describe('capitalizeWords', () => {
    it('capitaliza la primera letra de cada palabra', () => {
      expect(capitalizeWords('juan pérez gómez')).toBe('Juan Pérez Gómez');
    });

    it('normaliza mayúsculas previas', () => {
      expect(capitalizeWords('ACME LTDA')).toBe('Acme Ltda');
    });
  });

  describe('formatNIT', () => {
    it('respeta un NIT que ya trae guión', () => {
      expect(formatNIT('900123456-7')).toBe('900123456-7');
    });

    it('inserta el guión antes del dígito de verificación', () => {
      expect(formatNIT('9001234567')).toBe('900123456-7');
    });

    it('devuelve el original si tiene menos de 2 caracteres', () => {
      expect(formatNIT('9')).toBe('9');
    });
  });
});
