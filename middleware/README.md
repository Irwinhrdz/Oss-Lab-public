# Provisioning middleware (OSS Lab)

NestJS service that turns a sign-up into an active subscriber in the Open5GS core, first validating
the coverage site in NetBox. See the full repo at [`../README.md`](../README.md).

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/subscribers` | Validates the site in NetBox, generates IMSI/K/OPc and inserts them into Mongo |
| `GET` | `/health` | Used by Zabbix as an HTTP agent item |

### `POST /subscribers`

```json
// Request
{ "cliente": "Juan Perez", "plan": "10GB", "sitio": "skb837" }

// Response
{ "imsi": "999700000000099", "k": "...", "opc": "...", "cliente": "Juan Perez", "plan": "10GB", "sitio": "skb837" }
```

`sitio` is the Site's **slug** in NetBox, and it must be in `active` status.

## Environment variables

See [`.env.example`](./.env.example). Validated at boot with Joi (`src/config/validation.ts`) — the
service refuses to start if any are missing.

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `NETBOX_URL` | NetBox base URL |
| `NETBOX_API_TOKEN` | NetBox API token |
| `OPEN5GS_MONGO_URI` | URI of Open5GS's remote MongoDB |
| `TEMPLATE_IMSI` | IMSI of the template subscriber to copy |
| `IMSI_PREFIX` | Prefix for generated IMSIs (default `99970`) |

## Structure

```
src/
├── config/        # Loading and validation (Joi) of environment variables
├── health/        # GET /health
├── netbox/        # NetBox HTTP client (validates the site is active)
├── open5gs/        # Mongo connection, IMSI generation, and template copy
└── subscribers/    # Orchestrates netbox + open5gs; exposes POST /subscribers
```

## Development

```bash
npm install
cp .env.example .env   # fill in with real values from your VM
npm run start:dev
```

## Tests

```bash
npm test          # unit tests (vitest)
npm run test:e2e   # end-to-end
npm run lint        # oxlint
```

## Build and Docker

```bash
npm run build
docker compose up -d --build
```
