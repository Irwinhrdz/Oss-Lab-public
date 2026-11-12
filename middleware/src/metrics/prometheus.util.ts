/**
 * Parsea un texto expuesto por Prometheus a un mapa {metrica: valor}, sumando las
 * distintas series de una misma métrica (ej. varias combinaciones de plmnid/snssai).
 */
export function parsePrometheusMetrics(text: string): Record<string, number> {
  const pattern = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{[^}]*\})?\s+(-?[\d.eE+-]+)$/gm;
  const result: Record<string, number> = {};
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [, name, value] = match;
    result[name] = (result[name] ?? 0) + Number(value);
  }

  return result;
}

/** Atajo para leer una sola métrica; null si no aparece en el texto. */
export function sumPrometheusMetric(text: string, metricName: string): number | null {
  return parsePrometheusMetrics(text)[metricName] ?? null;
}
