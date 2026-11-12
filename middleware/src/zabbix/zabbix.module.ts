import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZabbixService } from './zabbix.service.js';

@Module({
  imports: [HttpModule],
  providers: [ZabbixService],
  exports: [ZabbixService],
})
export class ZabbixModule {}
