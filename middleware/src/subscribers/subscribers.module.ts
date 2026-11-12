import { Module } from '@nestjs/common';
import { NetboxModule } from '../netbox/netbox.module.js';
import { Open5gsModule } from '../open5gs/open5gs.module.js';
import { SubscribersController } from './subscribers.controller.js';
import { SubscribersService } from './subscribers.service.js';

@Module({
  imports: [NetboxModule, Open5gsModule],
  controllers: [SubscribersController],
  providers: [SubscribersService],
})
export class SubscribersModule {}
