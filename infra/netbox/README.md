# NetBox — inventario de sitios (OSS)

Guarda sitios, torres, equipos e IPs. Aquí se registra el gNB simulado como si fuera un sitio real
(por ejemplo, un SKB de St. Kitts). Detalle completo: Paso 3 del lab.

## Instalación

```bash
git clone -b release https://github.com/netbox-community/netbox-docker.git
cd netbox-docker
cp ../oss-lab/infra/netbox/docker-compose.override.yml .
docker compose pull && docker compose up -d
docker compose exec netbox /opt/netbox/netbox/manage.py createsuperuser
```

`docker-compose.override.yml` publica el puerto 8000 en vez del 8080 interno, y **solo en
`127.0.0.1`** de la VM — mismo criterio de seguridad que la WebUI de Open5GS (ver
[`docker-compose.override.yml`](./docker-compose.override.yml)). Para entrar desde tu Mac, abre un
túnel SSH y déjalo corriendo:

```bash
ssh -i ~/.ssh/oss-lab-vm.key -L 8000:localhost:8000 ubuntu@<ip>
```

## Configuración inicial

Primero crea el superusuario (la imagen no trae uno por defecto):

```bash
docker compose exec netbox /opt/netbox/netbox/manage.py createsuperuser
```

Con el túnel abierto, `http://localhost:8000` ya deja administrar todo a mano (Region, Site, Manufacturer,
Device Type, Device, API Tokens). Para no repetirlo a mano cada vez, [`seed.py`](./seed.py) crea el Site del
gNB simulado (slug `skb837`, status `active` — el middleware rechaza cualquier otro estado), su Device, y
un API Token:

```bash
docker compose cp seed.py netbox:/tmp/seed.py
docker compose exec netbox /opt/netbox/netbox/manage.py shell -c "exec(open('/tmp/seed.py').read())"
```

Imprime `NETBOX_API_TOKEN=...` al final — ese es el valor para `middleware/.env`.

### Importante: NetBox 4.7 cambió el formato de los tokens

Por defecto, un token nuevo (creado desde la UI o la API) es **v2**: usa el header
`Authorization: Bearer nbt_<key>.<secreto>`, no `Authorization: Token <valor>`. El middleware de este repo
está escrito para el esquema clásico (`Token`), así que **hay que crear tokens v1 explícitamente**
(`seed.py` ya lo hace con `version=TokenVersionChoices.V1`). Si se crea un token desde la UI sin fijarse en
esto, la llamada del middleware falla con `"Invalid v1 token"` aunque el token exista y esté activo.

## Contrato con el middleware

El middleware llama `GET /api/dcim/sites/?slug=<sitio>` con header `Authorization: Token <NETBOX_API_TOKEN>`
y exige `results[0].status.value === "active"`. El campo `sitio` del `POST /subscribers` es el **slug** del Site,
no su nombre visible.
