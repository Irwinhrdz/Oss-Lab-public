import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NetboxService } from './netbox.service.js';

@Module({
  imports: [HttpModule],
  providers: [NetboxService],
  exports: [NetboxService],
})
export class NetboxModule {}
