# Qué hace cada sistema y cómo se relacionan

Resumen corto para no perderse entre las piezas del lab.

```
                              ┌──────────────┐
         POST /subscribers    │  middleware  │   GET /topology
         ────────────────────▶│   (NestJS)   │◀──────────┬──────────┐
                              └──────┬───────┘            │          │
                        valida sitio │                    │          │
                              (HTTP) ▼              lee métricas  lee Problems
                         ┌─────────┐              (HTTP /metrics) (HTTP API+token)
                         │ NetBox  │                      │          │
                         │(inventario)                    ▼          ▼
                         └─────────┘              ┌───────────┐ ┌───────────┐
                                                   │  Open5GS  │ │  Zabbix   │
                                                   │ (core 5G) │ │ (alarmas) │
                                                   └───────────┘ └───────────┘
                                                         ▲              │
                                                         └── vigila (local, sin API)
```

`/topology` es el único consumidor que le pega a los tres sistemas a la vez (ver su propia sección
más abajo); el resto de las flechas son las que ya existían desde antes.

## Open5GS — el core

El 4G/5G de verdad: varias **NF** (Network Function) separadas, cada una su propio proceso en la
VM, hablando entre sí por interfaces estandarizadas (3GPP). Las tres que `/topology` muestra:

| NF | Nombre completo | Qué hace |
| --- | --- | --- |
| **AMF** | Access and Mobility Management Function | La puerta de entrada del UE al core: recibe el registro del gNB (NGAP), autentica al suscriptor (consultando sus llaves K/OPc) y decide si lo deja entrar. Es el nodo con el que más conversa UERANSIM. |
| **SMF** | Session Management Function | Una vez que el UE ya está registrado (vía AMF), negocia su sesión de datos (PDU session): qué IP le asigna, qué política de tráfico aplica. Le dice al UPF cómo debe reenviar el tráfico de ese UE (interfaz N4). |
| **UPF** | User Plane Function | El único que mueve datos de verdad (paquetes GTP) — todo lo que el UE navega pasa físicamente por acá. AMF y SMF solo deciden y coordinan (plano de control); UPF es el plano de usuario. |

El flujo real es siempre en ese orden: **gNB → AMF** (registro) **→ SMF** (sesión) **→ UPF** (datos),
que es exactamente el orden en que aparecen conectados en el grafo de `/topology`.

Además de esas tres, Open5GS trae otras NF que este lab no usa en `/topology` pero sí corren en la
VM (PCF, UDM, UDR, AUSF, NRF, etc. — ver `infra/open5gs/README.md`); se omitieron del grafo por
simplicidad, no porque no existan.

Open5GS autentica al UE simulado (UERANSIM) y le da salida a Internet. Guarda los suscriptores
(`imsi`, `security.k`, `security.opc`) en su propio MongoDB — esa es la única base de datos "real"
del lab. Cada NF expone sus propias métricas Prometheus en `127.0.0.x:9090/metrics` (nativo de
Open5GS, sin nada que instalar).

**Se relaciona con:** el middleware le escribe suscriptores nuevos directo en su Mongo
(`Open5gsService.provisionSubscriber`) y le lee métricas para `/topology`. No sabe nada de NetBox
ni de Zabbix — es un sistema aislado, los otros dos giran alrededor de él.

## UERANSIM — el gNB y el UE simulados

Simula la parte de radio que en la vida real sería hardware: un **gNB** (la antena/estación base)
y uno o más **UE** (el teléfono/dispositivo del cliente). No es parte de Open5GS — es un proyecto
aparte (`aligungr/UERANSIM`) que se conecta al core real de Open5GS por NGAP/GTP-U como lo haría una
antena física. El UE se registra con el IMSI/K/OPc de un suscriptor que ya exista en el Mongo de
Open5GS (el que crea el middleware) y, una vez registrado, tiene salida real a Internet a través del
túnel (`ping`/DNS funcionando de verdad, ver `infra/ueransim/README.md`).

**Se relaciona con:** Open5GS únicamente (habla su mismo protocolo de core 5G) — no sabe nada de
NetBox, Zabbix ni del middleware. Zabbix sí lo vigila por fuera (`proc.num[nr-gnb]`, ver abajo), y
es el único motivo por el que existe el nodo `gNB` en `/topology`: no porque UERANSIM le reporte
nada al middleware, sino porque Zabbix nota si el proceso `nr-gnb` muere.

**Ojo con el nombre:** el "sitio" `skb837`/`skb839`/`skb816` de NetBox es solo un registro de
inventario — hoy existe un único UERANSIM corriendo en la VM, así que los tres sitios del grafo
apuntan al mismo nodo `gNB` (no hay un gNB simulado por sitio, ver sección de Topología).

## NetBox — el inventario

Fuente de verdad de qué **sitios** existen y cuáles están activos (`status: active`). Es el único
lugar donde se decide si un sitio tiene cobertura habilitada.

**Se relaciona con:** el middleware le pregunta "¿el sitio X existe y está activo?"
(`NetboxService.assertSiteActive`) **antes** de dar de alta un suscriptor en Open5GS. Es un gate de
validación en el momento del alta — **no queda ningún registro permanente** que diga "este IMSI
pertenece a este sitio"; una vez escrito en Open5GS, el suscriptor ya no sabe de qué sitio vino.

## Zabbix — las alarmas

Vigila que los procesos sigan vivos: `open5gs-amfd` (el core), `nr-gnb` (el gNB simulado), y hace
poll de `GET /health` del middleware. Corre un agente nativo en la VM que lee procesos locales — no
llama a la API de NetBox ni a la de Open5GS.

**Se relaciona con:** todo lo demás, pero de forma indirecta — si Open5GS o el middleware se caen,
Zabbix lo nota por fuera (proceso muerto / `/health` sin responder), no porque hable con ellos.

## Topología visual (`/topology`, `/topology/view`)

Es la pieza que combina datos de **los tres** sistemas a la vez — el único lugar del lab que lo
hace. Modelo clásico de NOC (FCAPS): inventario + rendimiento + fallas, en un solo grafo:

- **Inventario** — le pregunta a NetBox qué sitios hay (`NetboxService.listSites`).
- **Rendimiento** — le pregunta a Open5GS cuántos UEs/sesiones tiene cada NF ahora mismo, leyendo
  directo sus métricas Prometheus nativas (AMF/SMF/UPF en `127.0.0.x:9090/metrics`).
- **Fallas** — le pregunta a Zabbix qué Problems están activos (`ZabbixService.getActiveProblems`,
  con un API token propio, no la contraseña de Admin) y los cruza por texto contra los nodos del
  grafo (los triggers de `infra/zabbix/seed.sh` viven todos en un único host `oss-lab-vm`, así que
  el cruce es por palabra clave: "AMF" → nodo AMF, "gNB" → nodo gNB, "Middleware" → nodo Middleware).
  Un Problem que no matchea ningún nodo conocido (ej. el cosmético "Linux: Zabbix agent...") igual
  se lista en el panel de alarmas de la página, sin colgarlo de ningún nodo.

`gNB` y `Middleware` son nodos que **no existían antes** de esta integración — se agregaron porque
son justo lo que Zabbix vigila (`proc.num[nr-gnb]`, `middleware.health`) y no tenían dónde mostrarse
en el grafo. Ninguno de los dos expone métricas Prometheus propias: su estado depende 100% de si
Zabbix tiene o no un Problem abierto sobre ellos.

La página en `/topology/view` dibuja todo con Cytoscape.js (nodos en rojo si están `down` o tienen
alarma) y un panel lateral con el texto de cada alarma activa, con poll cada 5s.

## En una frase

| Sistema | Responde a | No sabe de |
| --- | --- | --- |
| Open5GS | "¿quién está conectado y con qué IMSI?" | NetBox, Zabbix, UERANSIM |
| UERANSIM | "¿cómo se conecta un UE real al core?" | NetBox, Zabbix, middleware |
| NetBox | "¿qué sitio existe y está activo?" | Open5GS, Zabbix, UERANSIM |
| Zabbix | "¿qué proceso/endpoint se cayó?" | NetBox, Open5GS (solo vigila, no les pregunta nada) |
| Topology | "¿cómo se ve todo eso junto, ahora mismo, con sus alarmas?" | — (combina los tres backends) |
