import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, MongoClient } from 'mongodb';
import { randomBytes } from 'node:crypto';

export interface SubscriberDocument {
  imsi: string;
  security: Record<string, unknown> & { k: string; opc: string };
  [key: string]: unknown;
}

export interface ProvisionedSubscriber {
  imsi: string;
  k: string;
  opc: string;
}

/**
 * Habla con el MongoDB de Open5GS (ver Paso 1 y Paso 5 del lab).
 * El suscriptor TEMPLATE_IMSI sirve de plantilla: solo se cambian imsi, k y opc.
 */
@Injectable()
export class Open5gsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Open5gsService.name);
  private client!: MongoClient;
  private subscribers!: Collection<SubscriberDocument>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get<string>('open5gs.mongoUri');
    this.client = new MongoClient(uri!);
    await this.client.connect();
    this.subscribers = this.client.db('open5gs').collection<SubscriberDocument>('subscribers');
    this.logger.log('Conectado al MongoDB de Open5GS');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  /** Genera un IMSI con el prefijo configurado y verifica que no exista ya. */
  async generateImsi(): Promise<string> {
    const prefix = this.config.get<string>('open5gs.imsiPrefix') ?? '99970';
    const suffixLength = 15 - prefix.length;

    let imsi: string;
    do {
      const max = 10 ** suffixLength;
      const suffix = Math.floor(Math.random() * max)
        .toString()
        .padStart(suffixLength, '0');
      imsi = `${prefix}${suffix}`;
    } while (await this.subscribers.findOne({ imsi }));

    return imsi;
  }

  /** Copia el suscriptor plantilla con un IMSI, K y OPc nuevos. K/OPc no se registran en logs. */
  async provisionSubscriber(imsi: string): Promise<ProvisionedSubscriber> {
    const templateImsi = this.config.get<string>('open5gs.templateImsi');
    const template = await this.subscribers.findOne({ imsi: templateImsi });
    if (!template) {
      throw new Error('Falta el suscriptor plantilla en MongoDB (revisa TEMPLATE_IMSI)');
    }

    const { _id, ...base } = template as SubscriberDocument & { _id: unknown };
    const k = randomBytes(16).toString('hex').toUpperCase();
    const opc = randomBytes(16).toString('hex').toUpperCase();

    await this.subscribers.insertOne({
      ...base,
      imsi,
      security: { ...base.security, k, opc },
    });

    this.logger.log(`Suscriptor aprovisionado en Open5GS: imsi=${imsi}`);
    return { imsi, k, opc };
  }
}
