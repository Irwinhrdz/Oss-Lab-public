# OSS Lab — core 5G, inventario y monitoreo

Lab de **OSS y red** (sin BSS): un middleware propio convierte un alta en un suscriptor activo en el
core 5G, validando el sitio de cobertura en el inventario y quedando vigilado por el NOC.

> Esta carpeta es la **versión pública** del lab: mismo código y misma arquitectura, sin datos de
> ninguna instancia concreta (IPs, llaves SSH, contraseñas de paneles). Ver
> [`docs/ESTADO-DEMO.md`](docs/ESTADO-DEMO.md) para qué está probado de verdad y qué queda fuera a
> propósito.

## Arquitectura y flujo de datos

![Arquitectura del OSS Lab: alta de suscriptor, flujo de datos del core 5G y vigilancia de Zabbix](docs/architecture.svg)

```
POST /subscribers ──▶ middleware (NestJS) ──▶ valida sitio ──▶ NetBox (inventario)
                                   │
                                   └────────▶ genera IMSI/K/OPc ──▶ MongoDB de Open5GS (core 5G)

Zabbix ──▶ vigila procesos del core/gNB y GET /health del middleware
```

Ver el detalle de qué hace cada sistema y cómo se relacionan en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

Lo único que se programa es el **middleware** (`middleware/`); el resto es software open source que
solo se instala y configura (`infra/`).

## Estructura de este repo

```
oss-lab/
├── middleware/     # Servicio NestJS de aprovisionamiento (lo único "a medida")
├── infra/          # Infraestructura como código: bootstrap de la VM, NetBox, Zabbix, Open5GS/UERANSIM
├── scripts/        # Scripts operativos (deploy del middleware a una instancia remota)
└── docs/           # Arquitectura, diagrama y estado de la demo
```

## Software usado

| Software | Rol | Repositorio |
| --- | --- | --- |
| Open5GS | Core 4G/5G | [open5gs/open5gs](https://github.com/open5gs/open5gs) |
| UERANSIM | gNB y UE simulados | [aligungr/UERANSIM](https://github.com/aligungr/UERANSIM) |
| NetBox | Inventario de sitios | [netbox-community/netbox-docker](https://github.com/netbox-community/netbox-docker) |
| Zabbix | Alarmas y KPIs | [zabbix/zabbix-docker](https://github.com/zabbix/zabbix-docker) |

## Quickstart

### 1. Preparar una VM propia

```bash
scp -i <tu-llave> infra/bootstrap/bootstrap-vm.sh ubuntu@<ip>:~
ssh -i <tu-llave> ubuntu@<ip> "bash bootstrap-vm.sh"
```

Luego sigue, en orden: [`infra/open5gs/README.md`](./infra/open5gs/README.md),
[`infra/ueransim/README.md`](./infra/ueransim/README.md), [`infra/netbox/README.md`](./infra/netbox/README.md),
[`infra/zabbix/README.md`](./infra/zabbix/README.md).

### 2. Desarrollar el middleware en local

```bash
cd middleware
cp .env.example .env   # completa NETBOX_URL/TOKEN y OPEN5GS_MONGO_URI reales
npm install --legacy-peer-deps
npm run start:dev
```

### 3. Desplegarlo a tu instancia

```bash
SSH_KEY=~/.ssh/tu-llave.key REMOTE=ubuntu@<ip-de-tu-vm> ./scripts/deploy-middleware.sh
```

El script sincroniza `middleware/` por rsync y levanta el contenedor con `docker compose`. El `.env` del
servidor **no se toca** desde el script: se crea una vez a mano en el servidor con los secretos reales.

## Seguridad

- Los puertos de administración (9999, 8000, 8080, 27017) solo deben abrirse a IPs específicas, nunca a
  `0.0.0.0/0` — son paneles con usuario por defecto.
- K/OPc nunca se escriben en logs (`middleware/src/subscribers/subscribers.service.ts`).
- Ningún `.env`, llave SSH ni credencial real se incluye en este repo — solo `*.example.*` con
  placeholders.

## Roadmap (fuera de este repo por ahora)

- Exponer el alta con la API **TMF640** (TM Forum Open APIs) sobre el mismo endpoint.
- Fase 2 (BSS: Kill Bill u Odoo) llamaría a este mismo `POST /subscribers` — se trataría como un
  **proyecto separado**; este repo se mantiene solo-OSS.
- Fase 2 (opcional, dentro de OSS): **multi-tenencia de NFs**. Hoy `/topology` asume un solo Open5GS
  core (un AMF/SMF/UPF fijo) y un solo gNB simulado — los sitios de NetBox son solo inventario, no se
  relacionan con ningún NF ni cliente.

## Licencia

MIT — ver [`LICENSE`](LICENSE).
