import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NetboxService } from '../netbox/netbox.service.js';
import { Open5gsService } from '../open5gs/open5gs.service.js';
import { SubscribersService } from './subscribers.service.js';
import type { CreateSubscriberDto } from './dto/create-subscriber.dto.js';

describe('SubscribersService', () => {
  let service: SubscribersService;
  let assertSiteActive: ReturnType<typeof vi.fn>;
  let generateImsi: ReturnType<typeof vi.fn>;
  let provisionSubscriber: ReturnType<typeof vi.fn>;

  const dto: CreateSubscriberDto = { cliente: 'Juan Perez', plan: '10GB', sitio: 'skb837' };

  beforeEach(async () => {
    assertSiteActive = vi.fn();
    generateImsi = vi.fn();
    provisionSubscriber = vi.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscribersService,
        { provide: NetboxService, useValue: { assertSiteActive } },
        { provide: Open5gsService, useValue: { generateImsi, provisionSubscriber } },
      ],
    }).compile();

    service = moduleRef.get(SubscribersService);
  });

  it('valida el sitio, genera el imsi y aprovisiona el suscriptor', async () => {
    assertSiteActive.mockResolvedValue({ id: 1, name: 'SKB837', slug: 'skb837', status: { value: 'active' } });
    generateImsi.mockResolvedValue('999700000000099');
    provisionSubscriber.mockResolvedValue({ imsi: '999700000000099', k: 'K', opc: 'OPC' });

    const result = await service.create(dto);

    expect(assertSiteActive).toHaveBeenCalledWith('skb837');
    expect(provisionSubscriber).toHaveBeenCalledWith('999700000000099');
    expect(result).toEqual({
      imsi: '999700000000099',
      k: 'K',
      opc: 'OPC',
      cliente: dto.cliente,
      plan: dto.plan,
      sitio: 'skb837',
    });
  });

  it('propaga el error si el sitio no es válido y no aprovisiona nada', async () => {
    assertSiteActive.mockRejectedValue(new NotFoundException('sitio inválido'));

    await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    expect(generateImsi).not.toHaveBeenCalled();
    expect(provisionSubscriber).not.toHaveBeenCalled();
  });
});
