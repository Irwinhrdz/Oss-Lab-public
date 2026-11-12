# UERANSIM — gNB y UE simulados

Simula la radiobase (gNB) y el teléfono (UE). El éxito es ver la interfaz `uesimtun0` con IP y poder
hacer ping por ella. Detalle completo: [`../../Lab OSS BSS de la venta a la red.md`](../../Lab%20OSS%20BSS%20de%20la%20venta%20a%20la%20red.md) · Paso 2.

## Compilación

```bash
sudo apt install -y make gcc g++ libsctp-dev lksctp-tools iproute2
git clone https://github.com/aligungr/UERANSIM.git
cd UERANSIM && make
```

## Configuración

- `config/open5gs-gnb.yaml` — ver [`open5gs-gnb.example.yaml`](./open5gs-gnb.example.yaml): `linkIp`, `ngapIp`,
  `gtpIp` y `amfConfigs` deben apuntar a la IP privada de la VM OSS.
- `config/open5gs-ue.yaml` — ver [`open5gs-ue.example.yaml`](./open5gs-ue.example.yaml): `supi`, `key` y `op`
  deben coincidir exactamente con el suscriptor creado en Open5GS (`opType: OPC`). Si el UE falla con error de
  autenticación, casi siempre es K/OPc distinto entre MongoDB y el yaml.

## Salida a internet para los UE

**Correr `net-fixup.sh` ANTES de levantar `nr-ue`** (y después de cada reinicio de la
VM, porque son ajustes en caliente que no sobreviven un reboot):

```bash
sudo bash net-fixup.sh
```

El script hace más que `ip_forward` + `MASQUERADE` porque en este lab (todo-en-una-VM,
UPF y UE compartiendo kernel) esa combinación simple **no alcanza**. Tres problemas
reales que resuelve, de más a menos obvio:

1. **Docker pone `FORWARD` en `DROP`** al instalarse — sin una excepción en
   `DOCKER-USER` para la interfaz `ogstun`, ningún paquete del UPF se reenvía.
2. **`MASQUERADE` no sirve aquí** — con la tabla de ruteo propia que crea `nr-ue`
   para sí mismo, `MASQUERADE` no logra resolver la IP de la interfaz de salida y
   termina sin traducir nada (se confirma con `conntrack -E`: la respuesta esperada
   seguía apuntando a la IP del UE, nunca a la de la VM). Se usa `SNAT` explícito
   en su lugar, y **solo** en la interfaz WAN real — si se aplica también en el
   primer salto local (`uesimtun0`), corrompe el paquete antes de que llegue al UPF.
3. **`conntrack` "congela" la decisión de NAT** la primera vez que ve el paquete
   (cuando sale localmente por `uesimtun0`, donde ninguna regla de NAT aplica) y no
   la reevalúa cuando el mismo paquete reaparece por `ogstun`/la interfaz WAN (donde
   sí debería aplicar el SNAT). Se soluciona con `NOTRACK` en el primer salto, para
   que conntrack recién empiece a trackear el paquete cuando llega por `ogstun`.

Además, la regla de ruteo por proceso que `nr-ue` crea para sí mismo (tabla
`rt_uesimtun0`) usa una prioridad variable entre corridas (se ha visto 0, 99 y
32765) y si "gana" esa carrera, el tráfico hace loop entre `ogstun` y `uesimtun0`
(visible como `Time to live exceeded` en el ping). Por eso el script agrega su
propia regla de prioridad 0 **antes** de levantar `nr-ue` — necesita ser el primero
en esa prioridad, no solo tener un número bajo.

## Arranque y prueba

```bash
sudo bash net-fixup.sh                          # una vez por reinicio de la VM
./build/nr-gnb -c config/open5gs-gnb.yaml       # terminal 1
sudo ./build/nr-ue -c config/open5gs-ue.yaml    # terminal 2
```

**Para probar, usar la IP del UE, no el nombre de la interfaz:**

```bash
sudo ping -I 10.45.0.2 8.8.8.8      # SÍ: bind por dirección — funciona
sudo ping -I uesimtun0 8.8.8.8      # NO: desde esta misma VM, nunca recibe respuesta
```

Motivo: la IP del UE (`10.45.0.x`) queda registrada en la tabla `local` del kernel
porque la interfaz vive en este mismo host. Cuando la respuesta de Internet llega
genuinamente (se puede confirmar con `tcpdump -i enp0s6 icmp`, se ve la respuesta
entrando), el kernel la entrega "local" en vez de reenviarla por `ogstun`→`uesimtun0`,
y el socket de `ping -I uesimtun0` (que usa `SO_BINDTODEVICE`) la descarta porque
llegó por la interfaz física, no por `uesimtun0`. Haciendo *bind* por **dirección**
en vez de por **interfaz**, `ping` no filtra por interfaz de llegada y sí la recibe.
Un UE real (no en esta misma VM) no tiene este problema.
