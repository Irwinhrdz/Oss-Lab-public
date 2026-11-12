import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NfMetricsService } from './nf-metrics.service.js';

@Module({
  imports: [HttpModule],
  providers: [NfMetricsService],
  exports: [NfMetricsService],
})
export class MetricsModule {}
