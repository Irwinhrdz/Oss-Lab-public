import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { NetboxService, type NetboxSite } from './netbox.service.js';

function axiosResponseOf<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  };
}

describe('NetboxService', () => {
  let service: NetboxService;
  let httpGet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    httpGet = vi.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        NetboxService,
        { provide: HttpService, useValue: { get: httpGet } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                'netbox.url': 'http://netbox.local',
                'netbox.apiToken': 'test-token',
              })[key],
          },
        },
      ],
    }).compile();

    service = moduleRef.get(NetboxService);
  });

  it('devuelve el sitio cuando existe y está activo', async () => {
    const site: NetboxSite = { id: 1, name: 'SKB837', slug: 'skb837', status: { value: 'active' } };
    httpGet.mockReturnValueOnce(of(axiosResponseOf({ results: [site] })));

    const result = await service.assertSiteActive('skb837');

    expect(result).toEqual(site);
    expect(httpGet).toHaveBeenCalledWith(
      'http://netbox.local/api/dcim/sites/',
      expect.objectContaining({
        params: { slug: 'skb837' },
        headers: { Authorization: 'Token test-token' },
      }),
    );
  });

  it('lanza NotFoundException si el sitio no existe', async () => {
    httpGet.mockReturnValueOnce(of(axiosResponseOf({ results: [] })));

    await expect(service.assertSiteActive('no-existe')).rejects.toThrow(/no existe en NetBox/);
  });

  it('lanza NotFoundException si el sitio existe pero no está activo', async () => {
    const site: NetboxSite = { id: 2, name: 'SKB838', slug: 'skb838', status: { value: 'planned' } };
    httpGet.mockReturnValueOnce(of(axiosResponseOf({ results: [site] })));

    await expect(service.assertSiteActive('skb838')).rejects.toThrow(/no está activo/);
  });
});
