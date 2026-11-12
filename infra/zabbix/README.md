# Zabbix — alarmas y KPIs (OSS)

Hace de NOC: vigila que los procesos del core y el gNB estén vivos, y vigila `/health` del middleware.

## Instalación (Docker: server + web + PostgreSQL)

El repo `zabbix-docker` dejó de usar archivos `docker-compose_v3_*.yaml` sueltos — ahora es
`compose.yaml`/`compose_pgsql.yaml` (con `extends` hacia `compose_zabbix_components.yaml`) + un
`Makefile` que pasa las variables necesarias. La vía soportada es `make`:

```bash
git clone https://github.com/zabbix/zabbix-docker.git
cd zabbix-docker
make up DB=pgsql OS=alpine
```

Esto trae `postgres-server`, `server-db-init`, `zabbix-server` y `zabbix-web-nginx-pgsql`. Publica el
puerto 8080 (HTTP) y 443 (HTTPS) en **`0.0.0.0`** — a diferencia de NetBox, aquí **no** se puede limitar a
`127.0.0.1` con un override de compose: la definición de puertos del proyecto usa `extends` desde otro
archivo, y un override con `host_ip` no la reemplaza, la **duplica** (Docker intenta bindear
`0.0.0.0:8080` y `127.0.0.1:8080` a la vez y falla con `address already in use`).

En su lugar, [`firewall-fixup.sh`](./firewall-fixup.sh) bloquea con `iptables`/`ip6tables` cualquier
conexión a los puertos 8080/443 que no venga de `127.0.0.1`/`::1` — mismo resultado de seguridad
(solo accesible por túnel SSH), sin pelear con el merge de compose. Correrlo después de cada
`make up` y después de cada reinicio de la VM (son reglas en caliente, no persisten):

```bash
sudo bash firewall-fixup.sh
```

Túnel para entrar desde tu Mac:

```bash
ssh -i ~/.ssh/oss-lab-vm.key -L 8080:localhost:8080 ubuntu@<ip>
```

Con el túnel abierto: `http://localhost:8080` (usuario `Admin`, clave `zabbix` — **cámbiala al entrar**,
ver más abajo cómo vía API si prefieres scriptearlo).

## Agente en la VM OSS

La imagen de Zabbix instalada acá es **7.4** — el agente debe ser de la misma línea, no el que trae por
defecto el repo de Ubuntu (suele ser más viejo). Agregar el repo oficial de Zabbix primero:

```bash
wget -q https://repo.zabbix.com/zabbix/7.4/release/ubuntu/pool/main/z/zabbix-release/zabbix-release_latest_7.4+ubuntu22.04_all.deb -O /tmp/zabbix-release.deb
sudo dpkg -i /tmp/zabbix-release.deb
sudo apt update
sudo apt install -y zabbix-agent2
```

Configurar **solo chequeos activos** (el agente empuja datos al server; evita que el server, corriendo
dentro de un contenedor Docker, tenga que alcanzar el agente del host por la red — típicamente no puede
llegar a `127.0.0.1` del host desde dentro del contenedor):

```bash
sudo sed -i \
  -e 's/^Server=.*/Server=127.0.0.1/' \
  -e 's/^ServerActive=.*/ServerActive=127.0.0.1:10051/' \
  -e 's/^Hostname=.*/Hostname=oss-lab-vm/' \
  /etc/zabbix/zabbix_agent2.conf
sudo systemctl restart zabbix-agent2
```

El puerto 10051 (trapper del server, para checks activos) ya queda publicado en `0.0.0.0` por el propio
compose de Zabbix — no hace falta tocarlo, el agente le habla por `127.0.0.1:10051` desde el mismo host.

### UserParameter para `/health` del middleware

Mismo motivo que arriba, al revés: si `middleware.health` fuera un **HTTP agent item**, lo ejecutaría el
contenedor `zabbix-server`, que corre en la red Docker del propio Zabbix (no `network_mode: host`) y por
lo tanto **tampoco** puede alcanzar `127.0.0.1:3000` de la VM — da falsos "Middleware no responde"
intermitentes (confirmado: el check flapea resuelve/vuelve a abrirse solo, no es un problema real del
middleware). La solución es la misma que para los demás items: que lo chequee el agente nativo del host,
como un `UserParameter`:

```bash
echo 'UserParameter=middleware.health,curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/health' \
  | sudo tee /etc/zabbix/zabbix_agent2.d/middleware.conf
sudo systemctl restart zabbix-agent2
zabbix_agent2 -t middleware.health -c /etc/zabbix/zabbix_agent2.conf   # debe devolver "200"
```

Hacerlo **antes** de correr `seed.sh`, que ya crea el item como `type: 7` (Zabbix agent activo), no HTTP
agent.

## Host, items y triggers

[`seed.sh`](./seed.sh) crea el host `oss-lab-vm` con la plantilla **Linux by Zabbix agent active**
(no la pasiva — con chequeos activos no hace falta registrar una interfaz de agente, y si se registra
una apuntando a `127.0.0.1` el server dispara un falso "agent is not available" porque ese loopback no
significa nada desde dentro del contenedor), más los items/triggers de este lab:

```bash
ZABBIX_PASSWORD=<clave de Admin> bash seed.sh
```

| Item key | Qué vigila | Trigger |
| --- | --- | --- |
| `proc.num[open5gs-amfd]` | Proceso AMF vivo | Alarma si `= 0` |
| `proc.num[nr-gnb]` | gNB simulado vivo | Alarma si `= 0` |
| `middleware.health` (UserParameter → `curl` local a `http://127.0.0.1:3000/health`) | Middleware de aprovisionamiento vivo | Alarma si no llegan datos en 2 min (`nodata()`) |

### La API cambió de versión (Zabbix 7.x)

Dos detalles que rompen scripts viejos:

- El token de `user.login` ya **no** va en el parámetro `"auth"` de cada llamada — va en el header
  `Authorization: Bearer <token>`.
- `user.update` para cambiar tu propia clave ya no acepta `password`/`current_password`; los nombres de
  campo son `passwd` y `current_passwd`:
  ```bash
  curl -s http://127.0.0.1:8080/api_jsonrpc.php -H "Content-Type: application/json-rpc" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"jsonrpc":"2.0","method":"user.update","params":{"userid":"1","current_passwd":"zabbix","passwd":"<clave nueva>"},"id":1}'
  ```

## Prueba

Detén el gNB (`sudo killall nr-gnb` en la VM) y confirma que aparece el Problem **"gNB simulado caido en
oss-lab-vm"** (vía `problem.get` o en la UI, pestaña Problems). Vuelve a levantarlo
([`../ueransim/README.md`](../ueransim/README.md)) y el Problem se cierra solo en el siguiente chequeo.
