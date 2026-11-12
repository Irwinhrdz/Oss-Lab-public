import { Test } from '@nestjs/testing';
import { SubscribersController } from './subscribers.controller.js';
import { SubscribersService } from './subscribers.service.js';
import type { CreateSubscriberDto } from './dto/create-subscriber.dto.js';

describe('SubscribersController', () => {
  let controller: SubscribersController;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = vi.fn();

    const moduleRef = await Test.createTestingModule({
      controllers: [SubscribersController],
      providers: [{ provide: SubscribersService, useValue: { create } }],
    }).compile();

    controller = moduleRef.get(SubscribersController);
  });

  it('delega el alta en SubscribersService.create', async () => {
    const dto: CreateSubscriberDto = { cliente: 'Juan Perez', plan: '10GB', sitio: 'skb837' };
    const provisioned = { imsi: '999700000000099', k: 'K', opc: 'OPC', ...dto };
    create.mockResolvedValue(provisioned);

    const result = await controller.create(dto);

    expect(create).toHaveBeenCalledWith(dto);
    expect(result).toBe(provisioned);
  });
});
