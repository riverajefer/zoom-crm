/**
 * Cuenta cuántas notificaciones de WhatsApp salieron de un `Promise.allSettled`.
 *
 * Los métodos de envío de `WhatsappService` no lanzan cuando Meta rechaza el
 * mensaje: devuelven `false`. Por eso una promesa cumplida no basta para
 * contarla como enviada; hay que mirar también su valor. Contar solo
 * `status === 'fulfilled'` reportaba «4 sent, 0 failed» mientras Meta
 * rechazaba los cuatro (número desregistrado, oct-2026).
 */
export function countWhatsappDeliveries(
  results: PromiseSettledResult<boolean>[],
): { sent: number; failed: number } {
  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true,
  ).length;
  return { sent, failed: results.length - sent };
}
