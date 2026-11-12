import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { parsePrometheusMetrics } from './prometheus.util.js';

/**
 * Lee el endpoint /metrics (formato Prometheus) que cada NF de Open5GS expone de forma
 * nativa. Si el NF está caído o no responde, devuelve null en vez de lanzar: la topología
 * debe poder dibujarse igual mostrando ese nodo como "down".
 */
@Injectable()
export class NfMetricsService {
  private readonly logger = new Logger(NfMetricsService.name);

  constructor(private readonly http: HttpService) {}

  async fetchMetrics(baseUrl: string): Promise<Record<string, number> | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<string>(`${baseUrl}/metrics`, {
          responseType: 'text',
          timeout: 2000,
        }),
      );
      return parsePrometheusMetrics(data);
    } catch (error) {
      this.logger.warn(`No se pudo leer métricas de ${baseUrl}: ${(error as Error).message}`);
      return null;
    }
  }
}
