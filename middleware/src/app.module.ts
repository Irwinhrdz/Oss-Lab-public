import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { validationSchema } from './config/validation.js';
import { HealthModule } from './health/health.module.js';
import { NetboxModule } from './netbox/netbox.module.js';
import { Open5gsModule } from './open5gs/open5gs.module.js';
import { SubscribersModule } from './subscribers/subscribers.module.js';
import { TopologyModule } from './topology/topology.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    HealthModule,
    NetboxModule,
    Open5gsModule,
    SubscribersModule,
    TopologyModule,
  ],
})
export class AppModule {}
