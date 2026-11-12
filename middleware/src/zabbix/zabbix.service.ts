import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface ZabbixProblem {
  eventid: string;
  name: string;
  severity: number;
}

interface ProblemGetResponse {
  result?: { eventid: string; name: string; severity: string }[];
  error?: { message: string };
}

/**
 * Lee las alarmas activas (Problems) de Zabbix vía su API JSON-RPC, con un token de
 * API propio (`Administration > API tokens`, ver docs/SISTEMAS.md) en vez de la
 * contraseña de Admin. Si Zabbix no está configurado o no responde, /topology debe
 * poder dibujarse igual: nunca lanza, devuelve [] (ver NfMetricsService, mismo criterio).
 */
@Injectable()
export class ZabbixService {
  private readonly logger = new Logger(ZabbixService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getActiveProblems(): Promise<ZabbixProblem[]> {
    const baseUrl = this.config.get<string>('zabbix.url');
    const apiToken = this.config.get<string>('zabbix.apiToken');
    if (!baseUrl || !apiToken) {
      return [];
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post<ProblemGetResponse>(
          `${baseUrl}/api_jsonrpc.php`,
          {
            jsonrpc: '2.0',
            method: 'problem.get',
            params: { output: ['eventid', 'name', 'severity'] },
            id: 1,
          },
          {
            headers: { 'Content-Type': 'application/json-rpc', Authorization: `Bearer ${apiToken}` },
            timeout: 2000,
          },
        ),
      );

      if (data.error) {
        throw new Error(data.error.message);
      }

      return (data.result ?? []).map((p) => ({
        eventid: p.eventid,
        name: p.name,
        severity: Number(p.severity),
      }));
    } catch (error) {
      this.logger.warn(`No se pudo leer Problems de Zabbix: ${(error as Error).message}`);
      return [];
    }
  }
}
