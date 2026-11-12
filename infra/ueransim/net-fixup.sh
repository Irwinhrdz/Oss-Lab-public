#!/bin/bash
# Red para el modo "todo en una VM": deja que el UE simulado (uesimtun0) salga a
# Internet pasando por el UPF (ogstun) y que la respuesta regrese. Nada de esto
# sobrevive un reinicio (son sysctl/iptables/ip rule en caliente), así que hay
# que volver a correr este script cada vez que se reinicia la VM.
#
# IMPORTANTE: correr ESTE script ANTES de levantar nr-ue. La regla de ruteo que
# nr-ue crea para sí mismo usa una prioridad variable entre corridas (se ha visto
# 0, 99 y 32765), y si se agrega después de la nuestra con la MISMA prioridad le
# gana por orden de inserción. Prioridad 0 + "agregada primero" es lo único que
# garantiza que esta regla siempre gane.
set -euo pipefail

IFACE_WAN="${IFACE_WAN:-enp0s6}"   # interfaz con salida a Internet de la VM OSS
UE_SUBNET="10.45.0.0/16"
VM_IP="${VM_IP:-<ip-privada-de-tu-vm>}"

sysctl -w net.ipv4.ip_forward=1
sysctl -w net.ipv4.conf.all.rp_filter=0
sysctl -w net.ipv4.conf.default.rp_filter=0
sysctl -w "net.ipv4.conf.${IFACE_WAN}.rp_filter=0"
sysctl -w net.ipv4.conf.all.accept_local=1
# ogstun puede no existir todavía si el UPF no arrancó; no es fatal.
sysctl -w net.ipv4.conf.ogstun.rp_filter=0 2>/dev/null || true
sysctl -w net.ipv4.conf.ogstun.accept_local=1 2>/dev/null || true

# Docker pone la cadena FORWARD en DROP por defecto; sin esto ningún paquete
# que entra o sale por ogstun se reenvía.
iptables -C DOCKER-USER -i ogstun -j ACCEPT 2>/dev/null || iptables -I DOCKER-USER 1 -i ogstun -j ACCEPT
iptables -C DOCKER-USER -o ogstun -j ACCEPT 2>/dev/null || iptables -I DOCKER-USER 1 -o ogstun -j ACCEPT

# SNAT explícito a la IP real de la VM. No usar MASQUERADE: con la tabla de
# ruteo propia que crea nr-ue, MASQUERADE no logra resolver la IP de salida y
# no traduce nada (se comprobó con conntrack). Debe aplicar SOLO en la salida
# real (oif=$IFACE_WAN) y nunca en el primer salto local (uesimtun0), o
# corrompe el paquete del UE antes de que llegue al UPF.
iptables -t nat -C POSTROUTING -s "$UE_SUBNET" -o "$IFACE_WAN" -j SNAT --to-source "$VM_IP" 2>/dev/null \
  || iptables -t nat -A POSTROUTING -s "$UE_SUBNET" -o "$IFACE_WAN" -j SNAT --to-source "$VM_IP"

# Sin esto, conntrack "congela" la decisión de NAT en el primer paso local
# (uesimtun0, donde ninguna regla aplica) y no la reevalúa cuando el mismo
# paquete reaparece por ogstun/$IFACE_WAN (donde sí debe aplicar el SNAT).
iptables -t raw -C OUTPUT -o uesimtun0 -j NOTRACK 2>/dev/null \
  || iptables -t raw -A OUTPUT -o uesimtun0 -j NOTRACK
iptables -t raw -C PREROUTING -i uesimtun0 -j NOTRACK 2>/dev/null \
  || iptables -t raw -A PREROUTING -i uesimtun0 -j NOTRACK

# Fuerza a que el tráfico que entra por ogstun se reenvíe con la tabla
# principal, en vez de la tabla de ruteo propia que crea nr-ue para sí mismo
# (que de otro modo también "secuestra" ese tráfico y lo vuelve a mandar a
# uesimtun0 en loop, visible como "Time to live exceeded" en el ping).
ip rule del iif ogstun table main pref 0 2>/dev/null || true
ip rule add iif ogstun table main pref 0

echo "net-fixup aplicado. Falta: levantar/relevantar nr-ue despues de esto."
