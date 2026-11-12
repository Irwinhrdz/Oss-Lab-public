# Estado del lab (versión demo)

Esta es la versión pública del lab: mismo código y misma arquitectura que el lab real, sin datos de
ninguna instancia concreta (IPs, llaves SSH, contraseñas de paneles). Para esos detalles operativos,
ver el repo privado.

## Probado de verdad, end-to-end

- **Open5GS**: core 4G/5G nativo (AMF, SMF, UPF + resto de NFs) con un suscriptor plantilla.
- **UERANSIM**: gNB + UE simulados registrados contra el core real, con `ping`/DNS funcionando a
  través del túnel de datos (0% de pérdida).
- **NetBox**: inventario de sitios con al menos uno `active`, consultado por el middleware antes de
  cada alta (`GET /api/dcim/sites/?slug=...`).
- **Zabbix**: vigilancia de los procesos del core/gNB y de `GET /health` del middleware, con alarmas
  reales probadas (se detuvo el gNB a propósito y el Problem correspondiente apareció y se cerró solo
  al recuperarse).
- **Middleware**: `POST /subscribers` probado de punta a punta — valida el sitio en NetBox, genera
  IMSI/K/OPc y aprovisiona el suscriptor en el Mongo de Open5GS. K/OPc nunca se escriben en logs.
- **Topología visual**: `GET /topology` combina inventario (NetBox) + rendimiento (métricas nativas
  Prometheus de cada NF) + fallas (Problems de Zabbix) en un solo grafo — el modelo clásico FCAPS de
  un NOC. `GET /topology/view` lo dibuja con Cytoscape.js, con refresco cada 5s.

## Qué no incluye esta carpeta

- Credenciales, IPs o rutas de llaves de ninguna VM concreta — `middleware/.env.example` y los
  `*.example.yaml` de `infra/` solo tienen placeholders.
- El historial completo de debugging de la instancia real (bugs de Mongo sin auth, reglas de
  `iptables`/`conntrack`, etc.) — esas notas quedan en el repo de trabajo; aquí solo se documenta la
  arquitectura y cómo reproducirla en una instancia propia.
