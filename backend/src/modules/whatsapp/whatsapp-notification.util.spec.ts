import { countWhatsappDeliveries } from './whatsapp-notification.util';

describe('countWhatsappDeliveries', () => {
  it('cuenta como enviadas solo las promesas cumplidas con true', () => {
    const results: PromiseSettledResult<boolean>[] = [
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: true },
    ];

    expect(countWhatsappDeliveries(results)).toEqual({ sent: 2, failed: 0 });
  });

  it('cuenta como fallidas las que Meta rechazó (cumplidas con false)', () => {
    const results: PromiseSettledResult<boolean>[] = [
      { status: 'fulfilled', value: false },
      { status: 'fulfilled', value: false },
      { status: 'fulfilled', value: false },
      { status: 'fulfilled', value: false },
    ];

    expect(countWhatsappDeliveries(results)).toEqual({ sent: 0, failed: 4 });
  });

  it('cuenta como fallidas las promesas rechazadas', () => {
    const results: PromiseSettledResult<boolean>[] = [
      { status: 'fulfilled', value: true },
      { status: 'rejected', reason: new Error('network') },
      { status: 'fulfilled', value: false },
    ];

    expect(countWhatsappDeliveries(results)).toEqual({ sent: 1, failed: 2 });
  });

  it('devuelve ceros sin destinatarios', () => {
    expect(countWhatsappDeliveries([])).toEqual({ sent: 0, failed: 0 });
  });
});
