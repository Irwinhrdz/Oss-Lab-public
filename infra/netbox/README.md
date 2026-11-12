# NetBox — site inventory (OSS)

Stores sites, towers, equipment and IPs. This is where the simulated gNB is registered as if it were
a real site (e.g., an SKB in St. Kitts). Full detail: Lab step 3.

## Installation

```bash
git clone -b release https://github.com/netbox-community/netbox-docker.git
cd netbox-docker
cp ../oss-lab/infra/netbox/docker-compose.override.yml .
docker compose pull && docker compose up -d
docker compose exec netbox /opt/netbox/netbox/manage.py createsuperuser
```

`docker-compose.override.yml` publishes port 8000 instead of the internal 8080, and **only on
`127.0.0.1`** of the VM — same security approach as the Open5GS WebUI (see
[`docker-compose.override.yml`](./docker-compose.override.yml)). To reach it from your Mac, open an
SSH tunnel and leave it running:

```bash
ssh -i ~/.ssh/oss-lab-vm.key -L 8000:localhost:8000 ubuntu@<ip>
```

## Initial configuration

First create the superuser (the image doesn't ship with one by default):

```bash
docker compose exec netbox /opt/netbox/netbox/manage.py createsuperuser
```

With the tunnel open, `http://localhost:8000` already lets you administer everything by hand (Region,
Site, Manufacturer, Device Type, Device, API Tokens). To avoid repeating that by hand every time,
[`seed.py`](./seed.py) creates the Site for the simulated gNB (slug `skb837`, status `active` — the
middleware rejects any other status), its Device, and an API Token:

```bash
docker compose cp seed.py netbox:/tmp/seed.py
docker compose exec netbox /opt/netbox/netbox/manage.py shell -c "exec(open('/tmp/seed.py').read())"
```

It prints `NETBOX_API_TOKEN=...` at the end — that's the value for `middleware/.env`.

### Important: NetBox 4.7 changed the token format

By default, a new token (created from the UI or the API) is **v2**: it uses the header
`Authorization: Bearer nbt_<key>.<secret>`, not `Authorization: Token <value>`. This repo's middleware
is written for the classic scheme (`Token`), so **v1 tokens must be created explicitly**
(`seed.py` already does this with `version=TokenVersionChoices.V1`). If a token is created from the UI
without paying attention to this, the middleware's call fails with `"Invalid v1 token"` even though the
token exists and is active.

## Contract with the middleware

The middleware calls `GET /api/dcim/sites/?slug=<sitio>` with the header
`Authorization: Token <NETBOX_API_TOKEN>` and requires `results[0].status.value === "active"`. The
`sitio` field in `POST /subscribers` is the Site's **slug**, not its display name.
