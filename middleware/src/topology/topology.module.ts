import { Module } from '@nestjs/common';
import { NetboxModule } from '../netbox/netbox.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { ZabbixModule } from '../zabbix/zabbix.module.js';
import { TopologyController } from './topology.controller.js';
import { TopologyService } from './topology.service.js';

@Module({
  imports: [NetboxModule, MetricsModule, ZabbixModule],
  controllers: [TopologyController],
  providers: [TopologyService],
})
export class TopologyModule {}
