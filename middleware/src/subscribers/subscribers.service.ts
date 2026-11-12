import { Injectable, Logger } from '@nestjs/common';
import { NetboxService } from '../netbox/netbox.service.js';
import { Open5gsService } from '../open5gs/open5gs.service.js';
import { CreateSubscriberDto } from './dto/create-subscriber.dto.js';

export interface SubscriberProvisioned {
  imsi: string;
  k: string;
  opc: string;
  cliente: string;
  plan: string;
  sitio: string;
}

@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    private readonly netbox: NetboxService,
    private readonly open5gs: Open5gsService,
  ) {}

  /** Valida el sitio en NetBox y aprovisiona el suscriptor en Open5GS (Paso 5 del lab). */
  async create(dto: CreateSubscriberDto): Promise<SubscriberProvisioned> {
    const site = await this.netbox.assertSiteActive(dto.sitio);
    const imsi = await this.open5gs.generateImsi();
    const { k, opc } = await this.open5gs.provisionSubscriber(imsi);

    // Nunca loguear k/opc: solo viajan en la respuesta al cliente que los pide.
    this.logger.log(`Alta procesada: cliente="${dto.cliente}" plan="${dto.plan}" sitio="${site.slug}" imsi=${imsi}`);

    return { imsi, k, opc, cliente: dto.cliente, plan: dto.plan, sitio: site.slug };
  }
}
