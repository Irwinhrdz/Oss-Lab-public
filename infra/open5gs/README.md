# Open5GS — 4G/5G core

Native install (no Docker) with MongoDB as the subscriber database. See the full detail in
[`../../Lab OSS BSS de la venta a la red.md`](../../Lab%20OSS%20BSS%20de%20la%20venta%20a%20la%20red.md) · Step 1.

## Installation

```bash
# 1. MongoDB (official Open5GS guide, mongodb-org package)
#    https://open5gs.org/open5gs/docs/guide/01-quickstart/

# 2. Open5GS
sudo add-apt-repository ppa:open5gs/latest -y
sudo apt update && sudo apt install -y open5gs

# 3. WebUI (requires Node.js 20)
curl -fsSL https://open5gs.org/open5gs/assets/webui/install | sudo -E bash -
```

## Configuration

Edit `/etc/open5gs/amf.yaml` and `/etc/open5gs/upf.yaml` — see
[`amf.ngap.example.yaml`](./amf.ngap.example.yaml) and
[`upf.gtpu.example.yaml`](./upf.gtpu.example.yaml) for the exact sections to change (the VM's private
IP). Leave the default PLMN (MCC 999, MNC 70) to get started.

```bash
sudo systemctl restart open5gs-amfd open5gs-upfd
```

## Template subscriber

Create it from the WebUI (port 9999, user `admin` — set the password on first login) or via CLI:

```bash
git clone https://github.com/open5gs/open5gs.git
cd open5gs/misc/db
./open5gs-dbctl add 999700000000001 465B5CE8B199B49FAA5F0A2EE238A6BC E8ED289DEBA952E4283B54E88E6183CA
```

That IMSI is the `TEMPLATE_IMSI` used by the middleware (`../../middleware/.env.example`).

## Mongo access for the middleware

The original doc assumes the middleware runs on **another server** and asks to expose port 27017 only
to its IP. In this lab the middleware runs on **the same VM** (see [`../../README.md`](../../README.md)),
so nothing needs to be exposed:

1. Leave `bindIp: 127.0.0.1` in `/etc/mongod.conf` (the default) and enable
   `security.authorization: enabled`.
2. With `mongosh` (without auth, before enabling it), create a user with `readWrite` role on the
   `open5gs` database:
   ```js
   db.createUser({ user: "middleware", pwd: "<password>", roles: [{ role: "readWrite", db: "open5gs" }] })
   ```
3. `sudo systemctl restart mongod` and confirm it fails without credentials and works with them.
4. The middleware connects via `127.0.0.1:27017` — that's why its container uses
   `network_mode: host` in [`../../middleware/docker-compose.yml`](../../middleware/docker-compose.yml).

If the middleware moves to another server in the future, the original steps apply then: `bindIp:
0.0.0.0` and open port 27017 only to that server's IP (never to `0.0.0.0/0`).

### Don't forget: the WebUI and 4 Open5GS daemons also talk to Mongo directly

Enabling `security.authorization` silently breaks **everything except the middleware** that also
reads/writes the `open5gs` database directly, because each one ships its own Mongo URI **without
credentials** by default:

- The **WebUI** (`DB_URI`, environment variable of the `open5gs-webui` systemd service) — breaks with
  "Internal Server Error" when logging in.
- **UDR, HSS, PCF and PCRF** (`db_uri`, first line of `/etc/open5gs/{udr,hss,pcf,pcrf}.yaml`) — break
  silently: the UE authenticates but registration fails with `Cannot find SUPI`/`Cannot find IMSI
  in DB` in `udrd`'s logs, because the query to Mongo without credentials returns nothing (it's not a
  loud error, just "not found").

All 5 need to be pointed at the same URI with the `middleware` user:

```bash
NEW_URI="mongodb://middleware:<password>@127.0.0.1:27017/open5gs?authSource=open5gs"

# WebUI: systemd override, don't edit the .service directly
sudo mkdir -p /etc/systemd/system/open5gs-webui.service.d
printf '[Service]\nEnvironment=DB_URI=%s\n' "$NEW_URI" | sudo tee /etc/systemd/system/open5gs-webui.service.d/override.conf
sudo systemctl daemon-reload

# UDR, HSS, PCF, PCRF: the first line of each yaml is literally "db_uri: ..."
for f in udr hss pcf pcrf; do
  sudo sed -i "1s#.*#db_uri: ${NEW_URI}#" "/etc/open5gs/${f}.yaml"
done

sudo systemctl restart open5gs-webui open5gs-udrd open5gs-hssd open5gs-pcfd open5gs-pcrfd
```
