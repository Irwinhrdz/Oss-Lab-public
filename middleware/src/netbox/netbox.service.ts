import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface NetboxSite {
  id: number;
  name: string;
  slug: string;
  status: { value: string; label?: string };
  description?: string;
  device_count?: number;
}

interface NetboxSitesResponse {
  results: NetboxSite[];
}

@Injectable()
export class NetboxService {
  private readonly logger = new Logger(NetboxService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifica en NetBox que el sitio exista y esté en estado "active".
   * Lanza NotFoundException si no existe o no está activo (ver Paso 5 del lab).
   */
  async assertSiteActive(siteSlug: string): Promise<NetboxSite> {
    const baseUrl = this.config.get<string>('netbox.url');
    const apiToken = this.config.get<string>('netbox.apiToken');

    const { data } = await firstValueFrom(
      this.http.get<NetboxSitesResponse>(`${baseUrl}/api/dcim/sites/`, {
        params: { slug: siteSlug },
        headers: { Authorization: `Token ${apiToken}` },
      }),
    );

    const site = data.results[0];
    if (!site) {
      throw new NotFoundException(`El sitio "${siteSlug}" no existe en NetBox`);
    }
    if (site.status.value !== 'active') {
      throw new NotFoundException(
        `El sitio "${siteSlug}" existe pero no está activo (estado: ${site.status.value})`,
      );
    }

    this.logger.log(`Sitio verificado en NetBox: ${site.slug} (status=${site.status.value})`);
    return site;
  }

  /** Lista todos los sitios de NetBox (para la topología visual, ver Paso 6 del lab). */
  async listSites(): Promise<NetboxSite[]> {
    const baseUrl = this.config.get<string>('netbox.url');
    const apiToken = this.config.get<string>('netbox.apiToken');

    const { data } = await firstValueFrom(
      this.http.get<NetboxSitesResponse>(`${baseUrl}/api/dcim/sites/`, {
        headers: { Authorization: `Token ${apiToken}` },
      }),
    );

    return data.results;
  }
}
