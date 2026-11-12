import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NetboxService, type NetboxSite } from '../netbox/netbox.service.js';
import { NfMetricsService } from '../metrics/nf-metrics.service.js';
import { ZabbixService, type ZabbixProblem } from '../zabbix/zabbix.service.js';
import { TopologyService } from './topology.service.js';

function buildModule(sites: NetboxSite[], problems: ZabbixProblem[]) {
  return Test.createTestingModule({
    providers: [
      TopologyService,
      { provide: NetboxService, useValue: { listSites: vi.fn().mockResolvedValue(sites) } },
      {
        provide: NfMetricsService,
        useValue: {
          fetchMetrics: vi
            .fn()
            .mockResolvedValueOnce({ fivegs_amffunction_rm_registeredsubnbr: 1, fivegs_amffunction_rm_reginitreq: 4 }) // amf
            .mockResolvedValueOnce({ fivegs_smffunction_sm_sessionnbr: 1 }) // smf
            .mockResolvedValueOnce(null), // upf caído
        },
      },
      { provide: ZabbixService, useValue: { getActiveProblems: vi.fn().mockResolvedValue(problems) } },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => `http://metrics-for/${key}` },
      },
    ],
  }).compile();
}

describe('TopologyService', () => {
  it('combina sitios de NetBox con métricas de los NFs en nodos y edges', async () => {
    const sites: NetboxSite[] = [
      { id: 1, name: 'SKB837', slug: 'skb837', status: { value: 'active' }, description: 'gNB simulado', device_count: 1 },
      { id: 2, name: 'SKB838', slug: 'skb838', status: { value: 'planned' } },
    ];

    const moduleRef = await buildModule(sites, []);
    const service = moduleRef.get(TopologyService);
    const topology = await service.getTopology();

    expect(topology.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'site:skb837',
          status: 'active',
          details: { Nombre: 'SKB837', Descripción: 'gNB simulado', Dispositivos: 1 },
        }),
        expect.objectContaining({ id: 'site:skb838', status: 'inactive' }),
        expect.objectContaining({ id: 'nf:gnb', status: 'up' }),
        expect.objectContaining({ id: 'nf:middleware', status: 'up' }),
        expect.objectContaining({ id: 'nf:amf', status: 'up', metric: 1 }),
        expect.objectContaining({ id: 'nf:upf', status: 'down', metric: null }),
      ]),
    );
    expect(topology.edges).toEqual(
      expect.arrayContaining([
        { source: 'site:skb837', target: 'nf:gnb' },
        { source: 'site:skb838', target: 'nf:gnb' },
        { source: 'nf:gnb', target: 'nf:amf' },
        { source: 'nf:amf', target: 'nf:smf' },
        { source: 'nf:smf', target: 'nf:upf' },
      ]),
    );
  });

  it('agrega el detalle de metricas crudas de un NF, sin inventar datos si esta caido', async () => {
    const sites: NetboxSite[] = [{ id: 1, name: 'SKB837', slug: 'skb837', status: { value: 'active' } }];
    const moduleRef = await buildModule(sites, []);
    const service = moduleRef.get(TopologyService);
    const topology = await service.getTopology();

    const amf = topology.nodes.find((n) => n.id === 'nf:amf')!;
    expect(amf.details['Solicitudes de registro']).toBe(4);
    expect(amf.details['Registros exitosos']).toBe(0);

    const upf = topology.nodes.find((n) => n.id === 'nf:upf')!;
    expect(upf.details['Nombre completo']).toBe('User Plane Function');
    expect(upf.details['Sesiones N4 recibidas (desde SMF)']).toBe('sin datos');
  });

  it('marca un nodo como caído si Zabbix tiene un Problem activo que lo menciona', async () => {
    const sites: NetboxSite[] = [{ id: 1, name: 'SKB837', slug: 'skb837', status: { value: 'active' } }];
    const problems: ZabbixProblem[] = [
      { eventid: '1', name: 'gNB simulado caido en oss-lab-vm', severity: 3 },
      { eventid: '2', name: 'Linux: Zabbix agent is not available (for 3m)', severity: 3 },
    ];

    const moduleRef = await buildModule(sites, problems);
    const service = moduleRef.get(TopologyService);
    const topology = await service.getTopology();

    expect(topology.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'nf:gnb', status: 'down' })]));
    expect(topology.alarms).toEqual([
      { eventid: '1', name: 'gNB simulado caido en oss-lab-vm', severity: 3, nodeId: 'nf:gnb' },
      { eventid: '2', name: 'Linux: Zabbix agent is not available (for 3m)', severity: 3, nodeId: null },
    ]);
  });
});
