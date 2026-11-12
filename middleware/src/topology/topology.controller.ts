import { Controller, Get, Header } from '@nestjs/common';
import { TopologyService, type Topology } from './topology.service.js';
import { topologyHtml } from './topology.page.js';

@Controller('topology')
export class TopologyController {
  constructor(private readonly topology: TopologyService) {}

  @Get()
  getTopology(): Promise<Topology> {
    return this.topology.getTopology();
  }

  @Get('view')
  @Header('Content-Type', 'text/html; charset=utf-8')
  view(): string {
    return topologyHtml;
  }
}
