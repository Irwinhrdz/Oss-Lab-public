import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NetboxService } from '../netbox/netbox.service.js';
import { NfMetricsService } from '../metrics/nf-metrics.service.js';
import { ZabbixService } from '../zabbix/zabbix.service.js';

export interface TopologyNode {
  id: string;
  label: string;
  type: 'site' | 'nf';
  status: 'active' | 'inactive' | 'up' | 'down';
  metric?: number | null;
  metricLabel?: string;
  /** Datos adicionales para el panel de detalle al hacer click en el nodo (ver /topology/view). */
  details: Record<string, string | number>;
}

export interface TopologyEdge {
  source: string;
  target: string;
}

export interface TopologyAlarm {
  eventid: string;
  name: string;
  severity: number;
  nodeId: string | null;
}

export interface Topology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  alarms: TopologyAlarm[];
}

interface NfDetailSpec {
  key: string;
  label: string;
}

interface NfSpec {
  id: string;
  label: string;
  fullName: string;
  role: string;
  metricName: string;
  metricLabel: string;
  details: NfDetailSpec[];
}

// Métricas crudas de cada NF (ver `fivegs_*` en su /metrics) elegidas a mano por ser
// legibles para alguien que no conoce el nombre interno de la métrica. fullName/role
// son la nomenclatura 3GPP explicada en docs/SISTEMAS.md.
const NF_CHAIN: NfSpec[] = [
  {
    id: 'amf',
    label: 'AMF',
    fullName: 'Access and Mobility Management Function',
    role: 'Registra y autentica al UE (gNB → AMF). Puerta de entrada al core.',
    metricName: 'fivegs_amffunction_rm_registeredsubnbr',
    metricLabel: 'UEs registrados',
    details: [
      { key: 'fivegs_amffunction_rm_reginitreq', label: 'Solicitudes de registro' },
      { key: 'fivegs_amffunction_rm_reginitsucc', label: 'Registros exitosos' },
      { key: 'fivegs_amffunction_amf_authreq', label: 'Solicitudes de autenticación' },
      { key: 'fivegs_amffunction_amf_authreject', label: 'Autenticaciones rechazadas' },
    ],
  },
  {
    id: 'smf',
    label: 'SMF',
    fullName: 'Session Management Function',
    role: 'Negocia la sesión de datos del UE ya registrado (IP, política de tráfico).',
    metricName: 'fivegs_smffunction_sm_sessionnbr',
    metricLabel: 'Sesiones activas',
    details: [
      { key: 'fivegs_smffunction_sm_pdusessioncreationreq', label: 'Sesiones PDU solicitadas' },
      { key: 'fivegs_smffunction_sm_n4sessionestabreq', label: 'Sesiones N4 solicitadas (hacia UPF)' },
      { key: 'pfcp_sessions_active', label: 'Sesiones PFCP activas' },
    ],
  },
  {
    id: 'upf',
    label: 'UPF',
    fullName: 'User Plane Function',
    role: 'Plano de usuario: el único que mueve los datos (paquetes GTP) de verdad.',
    metricName: 'fivegs_upffunction_upf_sessionnbr',
    metricLabel: 'Sesiones activas',
    details: [
      { key: 'fivegs_upffunction_sm_n4sessionestabreq', label: 'Sesiones N4 recibidas (desde SMF)' },
      { key: 'fivegs_ep_n3_gtp_indatapktn3upf', label: 'Paquetes GTP entrantes (N3)' },
      { key: 'fivegs_ep_n3_gtp_outdatapktn3upf', label: 'Paquetes GTP salientes (N3)' },
    ],
  },
];

const GNB_NODE_ID = 'nf:gnb';
const MIDDLEWARE_NODE_ID = 'nf:middleware';

/**
 * Las alarmas de Zabbix viven todas en el host único `oss-lab-vm` (ver infra/zabbix/seed.sh),
 * así que no hay por dónde filtrar por host — se asocian al nodo del grafo buscando una
 * palabra clave en el texto del Problem (los `description` de los triggers ya la incluyen).
 */
const ALARM_KEYWORDS: { match: string; nodeId: string }[] = [
  { match: 'AMF', nodeId: 'nf:amf' },
  { match: 'gNB', nodeId: GNB_NODE_ID },
  { match: 'Middleware', nodeId: MIDDLEWARE_NODE_ID },
];

function matchAlarmNode(problemName: string): string | null {
  return ALARM_KEYWORDS.find((k) => problemName.includes(k.match))?.nodeId ?? null;
}

/**
 * Combina sitios de NetBox (cobertura), las métricas Prometheus nativas de Open5GS
 * (estado/UEs conectados) y las alarmas activas de Zabbix en un solo grafo. Código
 * 100% propio — no usa el NMS de terceros (`open5gs-nms`) para evitar que dos sistemas
 * escriban en la misma Mongo.
 */
@Injectable()
export class TopologyService {
  constructor(
    private readonly netbox: NetboxService,
    private readonly metrics: NfMetricsService,
    private readonly zabbix: ZabbixService,
    private readonly config: ConfigService,
  ) {}

  async getTopology(): Promise<Topology> {
    const [sites, problems, ...nfMetrics] = await Promise.all([
      this.netbox.listSites(),
      this.zabbix.getActiveProblems(),
      ...NF_CHAIN.map((nf) => this.metrics.fetchMetrics(this.config.get<string>(`open5gs.nfMetricsUrls.${nf.id}`)!)),
    ]);

    const alarms: TopologyAlarm[] = problems.map((p) => ({
      eventid: p.eventid,
      name: p.name,
      severity: p.severity,
      nodeId: matchAlarmNode(p.name),
    }));
    const alarmedNodeIds = new Set(alarms.map((a) => a.nodeId).filter((id): id is string => id !== null));

    const siteNodes: TopologyNode[] = sites.map((site) => ({
      id: `site:${site.slug}`,
      label: site.slug,
      type: 'site',
      status: site.status.value === 'active' ? 'active' : 'inactive',
      details: {
        Nombre: site.name,
        Descripción: site.description || '(sin descripción)',
        Dispositivos: site.device_count ?? 0,
      },
    }));

    // gNB no expone métricas Prometheus propias en este lab: su único indicador de vida
    // es el proceso que vigila Zabbix (ver infra/zabbix/seed.sh), de ahí que arranque "up"
    // y solo una alarma lo pueda bajar.
    const gnbNode: TopologyNode = {
      id: GNB_NODE_ID,
      label: 'gNB',
      type: 'nf',
      status: 'up',
      details: { 'Vigilado por': 'Zabbix (proc.num[nr-gnb])', Origen: 'UERANSIM (ver docs/SISTEMAS.md)' },
    };

    const nfNodes: TopologyNode[] = NF_CHAIN.map((nf, i) => {
      const metricsForNf = nfMetrics[i];
      const details: Record<string, string | number> = { 'Nombre completo': nf.fullName, Rol: nf.role };
      for (const d of nf.details) {
        details[d.label] = metricsForNf ? (metricsForNf[d.key] ?? 0) : 'sin datos';
      }
      return {
        id: `nf:${nf.id}`,
        label: nf.label,
        type: 'nf',
        status: metricsForNf === null ? 'down' : 'up',
        metric: metricsForNf ? (metricsForNf[nf.metricName] ?? null) : null,
        metricLabel: nf.metricLabel,
        details,
      };
    });

    // Igual que el gNB: el middleware no se mide a sí mismo con Prometheus, solo sabe
    // que está vivo porque está respondiendo esta misma petición; Zabbix es quien de
    // verdad decide si baja (ver item `middleware.health` en infra/zabbix/seed.sh).
    const middlewareNode: TopologyNode = {
      id: MIDDLEWARE_NODE_ID,
      label: 'Middleware',
      type: 'nf',
      status: 'up',
      details: { 'Vigilado por': 'Zabbix (middleware.health)', Rol: 'Provisiona suscriptores y sirve /topology' },
    };

    const nodes = [siteNodes, [gnbNode], nfNodes, [middlewareNode]]
      .flat()
      .map((node) => (alarmedNodeIds.has(node.id) ? { ...node, status: 'down' as const } : node));

    const edges: TopologyEdge[] = [
      ...sites.map((site) => ({ source: `site:${site.slug}`, target: GNB_NODE_ID })),
      { source: GNB_NODE_ID, target: 'nf:amf' },
      { source: 'nf:amf', target: 'nf:smf' },
      { source: 'nf:smf', target: 'nf:upf' },
    ];

    return { nodes, edges, alarms };
  }
}
