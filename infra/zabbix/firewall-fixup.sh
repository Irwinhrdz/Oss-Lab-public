#!/bin/bash
# Restringe el acceso externo a la UI de Zabbix (puertos 8080/443 publicados por
# Docker en 0.0.0.0) a solo tráfico local — se accede por túnel SSH, igual que la
# WebUI de Open5GS y NetBox. No persiste tras un reinicio (son reglas iptables en
# caliente); volver a correr este script cada vez que se reinicia la VM.
#
# Por qué iptables y no "ports: 127.0.0.1:8080:8080" en el compose: el compose de
# zabbix-docker define el puerto vía "extends" desde otro archivo base, y un
# archivo de override con host_ip no reemplaza esa definición — la duplica
# (Docker intenta bindear 0.0.0.0:8080 y 127.0.0.1:8080 a la vez y falla con
# "address already in use"). Bloquear en el firewall logra el mismo resultado
# de seguridad sin pelear con el merge de compose.
set -euo pipefail

for PORT in 8080 443; do
  sudo iptables -C INPUT -p tcp --dport "$PORT" ! -s 127.0.0.1 -j REJECT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$PORT" ! -s 127.0.0.1 -j REJECT
  sudo ip6tables -C INPUT -p tcp --dport "$PORT" ! -s ::1 -j REJECT 2>/dev/null \
    || sudo ip6tables -I INPUT 1 -p tcp --dport "$PORT" ! -s ::1 -j REJECT
done

echo "firewall-fixup aplicado: 8080/443 solo accesibles desde 127.0.0.1/::1."
