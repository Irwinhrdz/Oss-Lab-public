#!/bin/bash
# Crea el host de la VM, los items de monitoreo (AMF, gNB simulado, /health del
# middleware) y sus triggers en Zabbix, vía la API. Correr después de instalar
# y configurar zabbix-agent2 en modo activo (ver README de esta carpeta).
#
# Uso: ZABBIX_PASSWORD=<clave admin> ./seed.sh
set -euo pipefail

API="http://127.0.0.1:8080/api_jsonrpc.php"
PASSWORD="${ZABBIX_PASSWORD:?Define ZABBIX_PASSWORD con la clave del usuario Admin}"

call() {
  curl -s "$API" -H "Content-Type: application/json-rpc" -H "Authorization: Bearer $TOKEN" -d "$1"
}

TOKEN=$(curl -s "$API" -H "Content-Type: application/json-rpc" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"user.login\",\"params\":{\"username\":\"Admin\",\"password\":\"${PASSWORD}\"},\"id\":1}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'])")

# Linux by Zabbix agent active — chequeos activos (el agente empuja, el server no
# necesita alcanzar al agente en la red; evita pelear con el bridge de Docker).
TEMPLATEID=$(call '{"jsonrpc":"2.0","method":"template.get","params":{"filter":{"host":["Linux by Zabbix agent active"]},"output":["templateid"]},"id":2}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['templateid'])")

GROUPID=$(call '{"jsonrpc":"2.0","method":"hostgroup.get","params":{"filter":{"name":"OSS Lab"}},"id":3}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['result'];print(d[0]['groupid'] if d else '')")
if [ -z "$GROUPID" ]; then
  GROUPID=$(call '{"jsonrpc":"2.0","method":"hostgroup.create","params":{"name":"OSS Lab"},"id":4}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['groupids'][0])")
fi

# Sin "interfaces": con solo chequeos activos no hace falta una interfaz de
# agente pasivo — si se agrega una, Zabbix la vigila aparte y dispara un falso
# "agent is not available" porque el server (en Docker) no puede alcanzar el
# loopback del host.
HOSTID=$(call '{"jsonrpc":"2.0","method":"host.get","params":{"filter":{"host":["oss-lab-vm"]}},"id":5}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['result'];print(d[0]['hostid'] if d else '')")
if [ -z "$HOSTID" ]; then
  HOSTID=$(call "{\"jsonrpc\":\"2.0\",\"method\":\"host.create\",\"params\":{\"host\":\"oss-lab-vm\",\"groups\":[{\"groupid\":\"$GROUPID\"}],\"templates\":[{\"templateid\":\"$TEMPLATEID\"}]},\"id\":6}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['hostids'][0])")
fi
echo "HOSTID=$HOSTID"

create_item() {
  call "{\"jsonrpc\":\"2.0\",\"method\":\"item.create\",\"params\":$1,\"id\":10}"
  echo ""
}

# type 7 = Zabbix agent (active). Los tres items son activos a propósito (el agente nativo de la
# VM empuja los datos): un HTTP agent item lo ejecutaría el contenedor zabbix-server, que no está en
# la red del host y no puede alcanzar 127.0.0.1:3000 de forma confiable (mismo problema de red Docker
# que ya se evitó para la interfaz de agente, ver README de esta carpeta) — da falsos "no responde"
# intermitentes. "middleware.health" requiere el UserParameter de infra/zabbix/README.md ya instalado
# en el agente antes de correr este script.
create_item "{\"name\":\"AMF process count\",\"key_\":\"proc.num[open5gs-amfd]\",\"hostid\":\"$HOSTID\",\"type\":7,\"value_type\":3,\"delay\":\"30s\"}"
create_item "{\"name\":\"gNB simulado process count\",\"key_\":\"proc.num[nr-gnb]\",\"hostid\":\"$HOSTID\",\"type\":7,\"value_type\":3,\"delay\":\"30s\"}"
create_item "{\"name\":\"Middleware /health\",\"key_\":\"middleware.health\",\"hostid\":\"$HOSTID\",\"type\":7,\"value_type\":3,\"delay\":\"30s\"}"

create_trigger() {
  call "{\"jsonrpc\":\"2.0\",\"method\":\"trigger.create\",\"params\":$1,\"id\":11}"
  echo ""
}

create_trigger "{\"description\":\"AMF caido en {HOST.NAME}\",\"expression\":\"last(/oss-lab-vm/proc.num[open5gs-amfd])=0\",\"priority\":4}"
create_trigger "{\"description\":\"gNB simulado caido en {HOST.NAME}\",\"expression\":\"last(/oss-lab-vm/proc.num[nr-gnb])=0\",\"priority\":3}"
create_trigger "{\"description\":\"Middleware no responde /health en {HOST.NAME}\",\"expression\":\"nodata(/oss-lab-vm/middleware.health,2m)=1\",\"priority\":3}"

echo "Listo. Revisa Problems en la UI para confirmar que no hay errores de creacion arriba."
