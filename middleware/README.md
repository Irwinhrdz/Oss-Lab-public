# Middleware de aprovisionamiento (OSS Lab)

Servicio NestJS que convierte un alta en un suscriptor activo en el core Open5GS, validando antes el
sitio de cobertura en NetBox. Ver el repo completo en [`../README.md`](../README.md).

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/subscribers` | Valida el sitio en NetBox, genera IMSI/K/OPc y los inserta en Mongo |
| `GET` | `/health` | Usado por Zabbix como HTTP agent item |

### `POST /subscribers`

```json
// Request
{ "cliente": "Juan Perez", "plan": "10GB", "sitio": "skb837" }

// Response
{ "imsi": "999700000000099", "k": "...", "opc": "...", "cliente": "Juan Perez", "plan": "10GB", "sitio": "skb837" }
```

`sitio` es el **slug** del Site en NetBox, y debe estar en estado `active`.

## Variables de entorno

Ver [`.env.example`](./.env.example). Validadas al boot con Joi (`src/config/validation.ts`) — el
servicio no arranca si falta alguna.

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP (default `3000`) |
| `NETBOX_URL` | Base URL de NetBox |
| `NETBOX_API_TOKEN` | Token de API de NetBox |
| `OPEN5GS_MONGO_URI` | URI del MongoDB remoto de Open5GS |
| `TEMPLATE_IMSI` | IMSI del suscriptor plantilla a copiar |
| `IMSI_PREFIX` | Prefijo de los IMSI generados (default `99970`) |

## Estructura

```
src/
├── config/        # Carga y validación (Joi) de variables de entorno
├── health/        # GET /health
├── netbox/        # Cliente HTTP de NetBox (valida sitio activo)
├── open5gs/        # Conexión a Mongo, generación de IMSI y copia de plantilla
└── subscribers/    # Orquesta netbox + open5gs; expone POST /subscribers
```

## Desarrollo

```bash
npm install
cp .env.example .env   # completa con valores reales de tu VM
npm run start:dev
```

## Tests

```bash
npm test          # unitarios (vitest)
npm run test:e2e   # end-to-end
npm run lint        # oxlint
```

## Build y Docker

```bash
npm run build
docker compose up -d --build
```
