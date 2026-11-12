# Open5GS — core 4G/5G

Instalación nativa (no Docker) con MongoDB como base de suscriptores. Ver el detalle completo en
[`../../Lab OSS BSS de la venta a la red.md`](../../Lab%20OSS%20BSS%20de%20la%20venta%20a%20la%20red.md) · Paso 1.

## Instalación

```bash
# 1. MongoDB (guía oficial de Open5GS, paquete mongodb-org)
#    https://open5gs.org/open5gs/docs/guide/01-quickstart/

# 2. Open5GS
sudo add-apt-repository ppa:open5gs/latest -y
sudo apt update && sudo apt install -y open5gs

# 3. WebUI (requiere Node.js 20)
curl -fsSL https://open5gs.org/open5gs/assets/webui/install | sudo -E bash -
```

## Configuración

Edita `/etc/open5gs/amf.yaml` y `/etc/open5gs/upf.yaml` — ver [`amf.ngap.example.yaml`](./amf.ngap.example.yaml) y
[`upf.gtpu.example.yaml`](./upf.gtpu.example.yaml) con las secciones exactas a cambiar (IP privada de la VM).
Deja el PLMN por defecto (MCC 999, MNC 70) para empezar.

```bash
sudo systemctl restart open5gs-amfd open5gs-upfd
```

## Suscriptor plantilla

Créalo desde la WebUI (puerto 9999, usuario `admin` — define la clave en el primer login) o por CLI:

```bash
git clone https://github.com/open5gs/open5gs.git
cd open5gs/misc/db
./open5gs-dbctl add 999700000000001 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA
```

Ese IMSI es el `TEMPLATE_IMSI` que usa el middleware (`../../middleware/.env.example`).

## Acceso a Mongo para el middleware

El doc original asume el middleware en **otro servidor** y pide exponer el 27017 solo a su IP. En este
lab el middleware corre en **la misma VM** (ver [`../../README.md`](../../README.md)), así que no hace
falta exponer nada:

1. Deja `bindIp: 127.0.0.1` en `/etc/mongod.conf` (el valor por defecto) y activa
   `security.authorization: enabled`.
2. Con `mongosh` (sin auth, antes de activarla), crea un usuario con rol `readWrite` sobre la base
   `open5gs`:
   ```js
   db.createUser({ user: "middleware", pwd: "<clave>", roles: [{ role: "readWrite", db: "open5gs" }] })
   ```
3. `sudo systemctl restart mongod` y confirma que sin credenciales falla y con ellas funciona.
4. El middleware se conecta por `127.0.0.1:27017` — por eso su contenedor usa
   `network_mode: host` en [`../../middleware/docker-compose.yml`](../../middleware/docker-compose.yml).

Si en el futuro el middleware se muda a otro servidor, ahí sí aplican los pasos originales: `bindIp:
0.0.0.0` y abrir el 27017 solo a la IP de ese servidor (nunca a `0.0.0.0/0`).

### No olvidar: la WebUI y 4 daemons de Open5GS también hablan con Mongo directo

Habilitar `security.authorization` rompe silenciosamente a **todo lo que no sea el middleware** y que
también lee/escribe la base `open5gs` directo, porque cada uno trae su propia URI de Mongo **sin
credenciales** por defecto:

- La **WebUI** (`DB_URI`, variable de entorno del servicio systemd `open5gs-webui`) — se rompe con
  "Internal Server Error" al loguear.
- **UDR, HSS, PCF y PCRF** (`db_uri`, primera línea de `/etc/open5gs/{udr,hss,pcf,pcrf}.yaml`) — se
  rompen en silencio: el UE se autentica pero el registro falla con `Cannot find SUPI`/`Cannot find IMSI
  in DB` en los logs de `udrd`, porque la consulta a Mongo sin credenciales no devuelve nada (no es un
  error ruidoso, solo "no encontrado").

Hay que apuntar los 5 a la misma URI con el usuario `middleware`:

```bash
NEW_URI="mongodb://middleware:<clave>@127.0.0.1:27017/open5gs?authSource=open5gs"

# WebUI: override systemd, no se edita el .service directo
sudo mkdir -p /etc/systemd/system/open5gs-webui.service.d
printf '[Service]\nEnvironment=DB_URI=%s\n' "$NEW_URI" | sudo tee /etc/systemd/system/open5gs-webui.service.d/override.conf
sudo systemctl daemon-reload

# UDR, HSS, PCF, PCRF: la primera línea de cada yaml es literalmente "db_uri: ..."
for f in udr hss pcf pcrf; do
  sudo sed -i "1s#.*#db_uri: ${NEW_URI}#" "/etc/open5gs/${f}.yaml"
done

sudo systemctl restart open5gs-webui open5gs-udrd open5gs-hssd open5gs-pcfd open5gs-pcrfd
```
