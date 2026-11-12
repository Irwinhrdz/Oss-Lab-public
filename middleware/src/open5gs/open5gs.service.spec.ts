import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Open5gsService, type SubscriberDocument } from './open5gs.service.js';

describe('Open5gsService', () => {
  let service: Open5gsService;
  let findOne: ReturnType<typeof vi.fn>;
  let insertOne: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    findOne = vi.fn();
    insertOne = vi.fn().mockResolvedValue({ acknowledged: true });

    const moduleRef = await Test.createTestingModule({
      providers: [
        Open5gsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                'open5gs.imsiPrefix': '99970',
                'open5gs.templateImsi': '999700000000001',
              })[key],
          },
        },
      ],
    }).compile();

    service = moduleRef.get(Open5gsService);
    // Evitamos onModuleInit (que abre una conexión real a Mongo) e inyectamos
    // una colección falsa para probar la lógica de generación/aprovisionamiento.
    (service as unknown as { subscribers: { findOne: typeof findOne; insertOne: typeof insertOne } }).subscribers = {
      findOne,
      insertOne,
    };
  });

  it('genera un IMSI de 15 dígitos con el prefijo configurado', async () => {
    findOne.mockResolvedValue(null);

    const imsi = await service.generateImsi();

    expect(imsi).toHaveLength(15);
    expect(imsi.startsWith('99970')).toBe(true);
  });

  it('reintenta si el IMSI generado ya existe', async () => {
    findOne.mockResolvedValueOnce({ imsi: 'colisión' }).mockResolvedValueOnce(null);

    const imsi = await service.generateImsi();

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(imsi).toHaveLength(15);
  });

  it('copia la plantilla con un imsi/k/opc nuevos y preserva el resto de campos', async () => {
    const template: SubscriberDocument & { _id: string } = {
      _id: 'mongo-id',
      imsi: '999700000000001',
      security: { k: 'OLDK', opc: 'OLDOPC', amf: '8000' },
      slice: [{ sst: 1 }],
    };
    findOne.mockResolvedValue(template);

    const result = await service.provisionSubscriber('999700000000099');

    expect(result.imsi).toBe('999700000000099');
    expect(result.k).toMatch(/^[0-9A-F]{32}$/);
    expect(result.opc).toMatch(/^[0-9A-F]{32}$/);

    const inserted = insertOne.mock.calls[0][0];
    expect(inserted._id).toBeUndefined();
    expect(inserted.slice).toEqual(template.slice);
    expect(inserted.security.amf).toBe('8000');
    expect(inserted.security.k).toBe(result.k);
  });

  it('falla si no encuentra el suscriptor plantilla', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.provisionSubscriber('999700000000099')).rejects.toThrow(/plantilla/);
  });
});
