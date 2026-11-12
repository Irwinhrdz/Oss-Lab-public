import { parsePrometheusMetrics, sumPrometheusMetric } from './prometheus.util.js';

describe('sumPrometheusMetric', () => {
  it('suma todas las series de una métrica con distintos labels', () => {
    const text = [
      '# HELP fivegs_amffunction_rm_registeredsubnbr algo',
      '# TYPE fivegs_amffunction_rm_registeredsubnbr gauge',
      'fivegs_amffunction_rm_registeredsubnbr{plmnid="99970",snssai="1"} 1',
      'fivegs_amffunction_rm_registeredsubnbr{plmnid="99971",snssai="2"} 2',
    ].join('\n');

    expect(sumPrometheusMetric(text, 'fivegs_amffunction_rm_registeredsubnbr')).toBe(3);
  });

  it('lee una métrica sin labels', () => {
    const text = 'pfcp_sessions_active 1\n';
    expect(sumPrometheusMetric(text, 'pfcp_sessions_active')).toBe(1);
  });

  it('devuelve null si la métrica no aparece', () => {
    expect(sumPrometheusMetric('otra_metrica 5\n', 'no_existe')).toBeNull();
  });
});

describe('parsePrometheusMetrics', () => {
  it('devuelve un mapa con todas las métricas del texto', () => {
    const text = ['fivegs_amffunction_amf_authreq 4', 'fivegs_amffunction_amf_authreject 0', 'amf_session 1'].join(
      '\n',
    );

    expect(parsePrometheusMetrics(text)).toEqual({
      fivegs_amffunction_amf_authreq: 4,
      fivegs_amffunction_amf_authreject: 0,
      amf_session: 1,
    });
  });
});
