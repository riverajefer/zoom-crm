import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../../database/prisma.service';
import { Logger } from '@nestjs/common';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let configService: ConfigService;

  const mockConfig: Record<string, string> = {
    'whatsapp.accessToken': 'test-token',
    'whatsapp.phoneNumberId': 'test-phone-id',
    'whatsapp.apiVersion': 'v22.0',
    'app.frontendUrl': 'http://test.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            whatsappActionContext: {
              create: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
            role: { findUnique: jest.fn() },
            user: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock global fetch
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Initialization', () => {
    it('should initialize with config values', () => {
      expect(service['accessToken']).toBe('test-token');
      expect(service['phoneNumberId']).toBe('test-phone-id');
      expect(service['baseUrl']).toContain('v22.0/test-phone-id/messages');
      expect(service['isConfigured']).toBe(true);
    });

    it('should set isConfigured to false if credentials are missing', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsappService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          {
            provide: PrismaService,
            useValue: { whatsappActionContext: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() } },
          },
        ],
      }).compile();

      const unconfiguredService = module.get<WhatsappService>(WhatsappService);
      expect(unconfiguredService['isConfigured']).toBe(false);
    });

    it('should use default apiVersion and frontendUrl if not provided', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            WhatsappService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn((key: string) => {
                    if (key === 'whatsapp.accessToken') return 'token';
                    if (key === 'whatsapp.phoneNumberId') return 'phone';
                    return undefined;
                }),
              },
            },
            {
              provide: PrismaService,
              useValue: { whatsappActionContext: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() } },
            },
          ],
        }).compile();
  
        const defaultService = module.get<WhatsappService>(WhatsappService);
        expect(defaultService['baseUrl']).toContain('v22.0/phone/messages');
        expect(defaultService['frontendUrl']).toBe('http://localhost:5173');
      });
  });

  describe('normalizePhone', () => {
    it('should remove non-digits and leading +', () => {
      expect(service['normalizePhone']('+57 311 832 2699')).toBe('573118322699');
    });

    it('should add 57 prefix to 10-digit Colombian numbers starting with 3', () => {
      expect(service['normalizePhone']('3118322699')).toBe('573118322699');
    });

    it('should not add prefix if it is already 12 digits', () => {
      expect(service['normalizePhone']('573118322699')).toBe('573118322699');
    });
  });

  describe('sendTemplateMessage', () => {
    const to = '3118322699';
    const template = 'test_template';
    const params = ['param1', 'param2'];

    it('should return null if not configured', async () => {
      (service as any).isConfigured = false;
      const result = await service.sendTemplateMessage(to, template, params);
      expect(result).toBeNull();
    });

    it('should send a successful template message', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          messages: [{ id: 'wa-msg-id-123' }],
        }),
      });

      const result = await service.sendTemplateMessage(to, template, params);

      expect(result).toBe('wa-msg-id-123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      expect(body.to).toBe('573118322699');
      expect(body.template.name).toBe(template);
    });

    it('should handle button parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          messages: [{ id: 'wa-msg-id-456' }],
        }),
      });

      const buttonParams = [{ index: 0, text: 'order-123' }];
      await service.sendTemplateMessage(to, template, params, 'es_CO', buttonParams);

      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      const buttons = body.template.components.filter((c: any) => c.type === 'button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].index).toBe('0');
      expect(buttons[0].parameters[0].text).toBe('order-123');
    });

    it('should return null and log error when response is not ok (with data.error.message)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({
          error: { message: 'Some WhatsApp API error' },
        }),
      });

      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const result = await service.sendTemplateMessage(to, template, params);

      expect(result).toBeNull();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Some WhatsApp API error'));
    });

    it('should return null and log error when response is not ok (without data.error.message)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          statusText: 'Forbidden',
          json: jest.fn().mockResolvedValue({}),
        });
  
        const loggerSpy = jest.spyOn(service['logger'], 'error');
        const result = await service.sendTemplateMessage(to, template, params);
  
        expect(result).toBeNull();
        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Forbidden'));
      });

    it('should handle missing message ID in successful response', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        });
  
        const result = await service.sendTemplateMessage(to, template, params);
        expect(result).toBeNull();
      });

    it('should return null and log error when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const result = await service.sendTemplateMessage(to, template, params);

      expect(result).toBeNull();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Network failure'));
    });
  });

  describe('notificarSolicitudEdicionOP', () => {
    it('should call sendTemplateMessage with correct arguments', async () => {
      const sendSpy = jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue('msg-id');
      
      const result = await service.notificarSolicitudEdicionOP(
        '3118322699',
        'Juan',
        'Vendedor',
        'OP-100',
        'Falta descuento',
        'ord_123'
      );

      expect(result).toBe('msg-id');
      expect(sendSpy).toHaveBeenCalledWith(
        '3118322699',
        'solicitud_edicion_op',
        ['Juan', 'Vendedor', 'OP-100', 'Falta descuento'],
        'es_CO',
        [{ index: 0, text: 'ord_123' }]
      );
    });
  });

  describe('sendTemplateMessage - param sanitization', () => {
    it('should replace null params with "-"', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messages: [{ id: 'msg1' }] }),
      });
      await service.sendTemplateMessage('573118322699', 'tpl', [null as any, 'valid']);
      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      const bodyParams = body.template.components[0].parameters;
      expect(bodyParams[0].text).toBe('-');
      expect(bodyParams[1].text).toBe('valid');
    });

    it('should replace undefined params with "-"', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messages: [{ id: 'msg1' }] }),
      });
      await service.sendTemplateMessage('573118322699', 'tpl', [undefined as any]);
      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      expect(body.template.components[0].parameters[0].text).toBe('-');
    });

    it('should replace empty string params with "-"', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messages: [{ id: 'msg1' }] }),
      });
      await service.sendTemplateMessage('573118322699', 'tpl', ['']);
      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      expect(body.template.components[0].parameters[0].text).toBe('-');
    });
  });

  describe('sendTextMessage', () => {
    it('should return null if not configured', async () => {
      (service as any).isConfigured = false;
      const result = await service.sendTextMessage('573000', 'hello');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should send text message and return messageId', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messages: [{ id: 'txt-1' }] }),
      });
      const result = await service.sendTextMessage('3118322699', 'Hola');
      expect(result).toBe('txt-1');
      const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchArgs[1].body);
      expect(body.type).toBe('text');
      expect(body.text.body).toBe('Hola');
      expect(body.to).toBe('573118322699');
    });

    it('should return null on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false, statusText: 'Forbidden',
        json: jest.fn().mockResolvedValue({}),
      });
      const result = await service.sendTextMessage('573000', 'hi');
      expect(result).toBeNull();
    });

    it('should return null on fetch exception', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('timeout'));
      const result = await service.sendTextMessage('573000', 'hi');
      expect(result).toBeNull();
    });

    it('should return null when no messageId in response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      });
      const result = await service.sendTextMessage('573000', 'hi');
      expect(result).toBeNull();
    });
  });

  describe('notificarSolicitudConBotones', () => {
    let prismaService: any;

    beforeEach(() => {
      prismaService = service['prisma'];
    });

    it('should send template and save action context', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue('msg-btn-1');
      prismaService.whatsappActionContext.create.mockResolvedValue({});

      await service.notificarSolicitudConBotones(
        '3118322699', 'Juan', 'Vendedor', 'OP-100', 'Motivo', 'ord1', 'req1',
      );

      expect(service.sendTemplateMessage).toHaveBeenCalledWith(
        '3118322699', 'solicitud_edicion_op_v2',
        ['Juan', 'Vendedor', 'OP-100', 'Motivo'], 'es_CO',
        [{ index: 0, text: 'ord1' }],
      );
      expect(prismaService.whatsappActionContext.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-btn-1', requestId: 'req1',
          requestType: 'ORDER_EDIT', adminPhone: '573118322699',
        }),
      });
    });

    it('should return early if sendTemplateMessage returns null', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue(null);
      prismaService.whatsappActionContext.create.mockResolvedValue({});

      await service.notificarSolicitudConBotones(
        '573000', 'J', 'V', 'OP-1', 'M', 'o1', 'r1',
      );

      expect(prismaService.whatsappActionContext.create).not.toHaveBeenCalled();
    });

    it('should log error but not throw if prisma create fails', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue('msg-btn-2');
      prismaService.whatsappActionContext.create.mockRejectedValue(new Error('unique constraint'));

      const loggerSpy = jest.spyOn(service['logger'], 'error');
      await expect(
        service.notificarSolicitudConBotones('573000', 'J', 'V', 'OP-1', 'M', 'o1', 'r1'),
      ).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('unique constraint'));
    });
  });

  describe('sendApprovalNotification', () => {
    let prismaService: any;

    beforeEach(() => {
      prismaService = service['prisma'];
    });

    it('should send generic approval template and save context', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue('msg-appr-1');
      prismaService.whatsappActionContext.create.mockResolvedValue({});

      await service.sendApprovalNotification({
        telefono: '3118322699',
        requesterName: 'Ana',
        requesterRole: 'Manager',
        actionDescription: 'Gasto $50K',
        reason: 'Urgente',
        requestId: 'greq1',
        requestType: 'EXPENSE_ORDER_AUTH' as any,
      });

      expect(service.sendTemplateMessage).toHaveBeenCalledWith(
        '3118322699', 'solicitud_aprobacion_v1',
        ['Ana', 'Manager', 'Gasto $50K', 'Urgente'], 'es_CO',
        [{ index: 0, text: 'greq1' }],
      );
      expect(prismaService.whatsappActionContext.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-appr-1', requestId: 'greq1',
          requestType: 'EXPENSE_ORDER_AUTH', adminPhone: '573118322699',
        }),
      });
    });

    it('should return early if sendTemplateMessage returns null', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue(null);
      prismaService.whatsappActionContext.create.mockResolvedValue({});

      await service.sendApprovalNotification({
        telefono: '573000', requesterName: 'X', requesterRole: 'R',
        actionDescription: 'D', reason: 'M', requestId: 'r1',
        requestType: 'EXPENSE_ORDER_AUTH' as any,
      });

      expect(prismaService.whatsappActionContext.create).not.toHaveBeenCalled();
    });

    it('should log error but not throw if context save fails', async () => {
      jest.spyOn(service, 'sendTemplateMessage').mockResolvedValue('msg-appr-2');
      prismaService.whatsappActionContext.create.mockRejectedValue(new Error('db error'));

      const loggerSpy = jest.spyOn(service['logger'], 'error');
      await expect(
        service.sendApprovalNotification({
          telefono: '573000', requesterName: 'X', requesterRole: 'R',
          actionDescription: 'D', reason: 'M', requestId: 'r1',
          requestType: 'EXPENSE_ORDER_AUTH' as any,
        }),
      ).resolves.toBeUndefined();
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('db error'));
    });
  });

  describe('getAdminPhones', () => {
    let prismaService: any;

    beforeEach(() => {
      prismaService = service['prisma'];
    });

    it('devuelve un solo teléfono cuando dos admins comparten el mismo número', async () => {
      prismaService.role.findUnique.mockResolvedValue({
        users: [{ phone: '3212016229' }, { phone: '3212016229' }],
      });

      await expect(service.getAdminPhones()).resolves.toEqual(['573212016229']);
    });

    it('colapsa el mismo número guardado con formatos distintos', async () => {
      prismaService.role.findUnique.mockResolvedValue({
        users: [
          { phone: '+573212016229' },
          { phone: '3212016229' },
          { phone: '573212016229' },
        ],
      });

      await expect(service.getAdminPhones()).resolves.toEqual(['573212016229']);
    });

    it('conserva los números distintos y los normaliza', async () => {
      prismaService.role.findUnique.mockResolvedValue({
        users: [{ phone: '3212016229' }, { phone: '+573118322699' }],
      });

      await expect(service.getAdminPhones()).resolves.toEqual([
        '573212016229',
        '573118322699',
      ]);
    });

    it('ignora usuarios sin teléfono', async () => {
      prismaService.role.findUnique.mockResolvedValue({
        users: [{ phone: null }, { phone: '3212016229' }],
      });

      await expect(service.getAdminPhones()).resolves.toEqual(['573212016229']);
    });

    it('devuelve lista vacía si no existe el rol admin', async () => {
      prismaService.role.findUnique.mockResolvedValue(null);

      await expect(service.getAdminPhones()).resolves.toEqual([]);
    });
  });

  describe('getPhonesByPermission', () => {
    let prismaService: any;

    beforeEach(() => {
      prismaService = service['prisma'];
    });

    it('deduplica los teléfonos de los usuarios con el permiso', async () => {
      prismaService.user.findMany.mockResolvedValue([
        { phone: '3212016229' },
        { phone: '+573212016229' },
        { phone: '3118322699' },
      ]);

      await expect(
        service.getPhonesByPermission('approve_discounts'),
      ).resolves.toEqual(['573212016229', '573118322699']);
    });

    it('filtra por el permiso recibido', async () => {
      prismaService.user.findMany.mockResolvedValue([]);

      await service.getPhonesByPermission('approve_refunds');

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            phone: { not: null },
            role: {
              permissions: {
                some: { permission: { name: 'approve_refunds' } },
              },
            },
          }),
        }),
      );
    });
  });
});
