import { Module } from '@nestjs/common';
import { Open5gsService } from './open5gs.service.js';

@Module({
  providers: [Open5gsService],
  exports: [Open5gsService],
})
export class Open5gsModule {}
