# Zabbix — alarms and KPIs (OSS)

Acts as the NOC: watches that the core and gNB processes are alive, and watches the middleware's
`/health`.

## Installation (Docker: server + web + PostgreSQL)

The `zabbix-docker` repo dropped the standalone `docker-compose_v3_*.yaml` files — it's now
`compose.yaml`/`compose_pgsql.yaml` (`extends`-ing `compose_zabbix_components.yaml`) plus a
`Makefile` that passes the required variables. The supported path is `make`:

```bash
git clone https://github.com/zabbix/zabbix-docker.git
cd zabbix-docker
make up DB=pgsql OS=alpine
```

This brings up `postgres-server`, `server-db-init`, `zabbix-server` and `zabbix-web-nginx-pgsql`. It
publishes port 8080 (HTTP) and 443 (HTTPS) on **`0.0.0.0`** — unlike NetBox, here it's **not**
possible to restrict to `127.0.0.1` with a compose override: the project's port definition uses
`extends` from another file, and an override with `host_ip` doesn't replace it, it **duplicates** it
(Docker tries to bind `0.0.0.0:8080` and `127.0.0.1:8080` at the same time and fails with
`address already in use`).

Instead, [`firewall-fixup.sh`](./firewall-fixup.sh) uses `iptables`/`ip6tables` to block any
connection to ports 8080/443 that doesn't come from `127.0.0.1`/`::1` — same security outcome
(only reachable via SSH tunnel), without fighting the compose merge. Run it after every
`make up` and after every VM reboot (these are live rules, they don't persist):

```bash
sudo bash firewall-fixup.sh
```

Tunnel to reach it from your Mac:

```bash
ssh -i ~/.ssh/oss-lab-vm.key -L 8080:localhost:8080 ubuntu@<ip>
```

With the tunnel open: `http://localhost:8080` (user `Admin`, password `zabbix` — **change it on
first login**, see below how to do it via the API if you'd rather script it).

## Agent on the OSS VM

The Zabbix image installed here is **7.4** — the agent must be from the same line, not the one
Ubuntu's repo ships by default (usually older). Add the official Zabbix repo first:

```bash
wget -q https://repo.zabbix.com/zabbix/7.4/release/ubuntu/pool/main/z/zabbix-release/zabbix-release_latest_7.4+ubuntu22.04_all.deb -O /tmp/zabbix-release.deb
sudo dpkg -i /tmp/zabbix-release.deb
sudo apt update
sudo apt install -y zabbix-agent2
```

Configure **active checks only** (the agent pushes data to the server; this avoids the server, which
runs inside a Docker container, having to reach the host's agent over the network — it typically
can't reach the host's `127.0.0.1` from inside the container):

```bash
sudo sed -i \
  -e 's/^Server=.*/Server=127.0.0.1/' \
  -e 's/^ServerActive=.*/ServerActive=127.0.0.1:10051/' \
  -e 's/^Hostname=.*/Hostname=oss-lab-vm/' \
  /etc/zabbix/zabbix_agent2.conf
sudo systemctl restart zabbix-agent2
```

Port 10051 (the server's trapper, for active checks) is already published on `0.0.0.0` by Zabbix's own
compose — no need to touch it, the agent talks to it via `127.0.0.1:10051` from the same host.

### UserParameter for the middleware's `/health`

Same reason as above, in reverse: if `middleware.health` were an **HTTP agent item**, it would be run
by the `zabbix-server` container, which runs on Zabbix's own Docker network (not
`network_mode: host`) and therefore **also** can't reach the VM's `127.0.0.1:3000` — it causes
intermittent false "Middleware not responding" alerts (confirmed: the check flaps and resolves on its
own, it's not a real middleware issue). The fix is the same as for the other items: have the host's
native agent check it, as a `UserParameter`:

```bash
echo 'UserParameter=middleware.health,curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/health' \
  | sudo tee /etc/zabbix/zabbix_agent2.d/middleware.conf
sudo systemctl restart zabbix-agent2
zabbix_agent2 -t middleware.health -c /etc/zabbix/zabbix_agent2.conf   # should return "200"
```

Do this **before** running `seed.sh`, which already creates the item as `type: 7` (active Zabbix
agent), not HTTP agent.

## Host, items and triggers

[`seed.sh`](./seed.sh) creates the host `oss-lab-vm` with the **Linux by Zabbix agent active**
template (not the passive one — with active checks there's no need to register an agent interface,
and if one is registered pointing at `127.0.0.1` the server triggers a false "agent is not available"
because that loopback means nothing from inside the container), plus this lab's items/triggers:

```bash
ZABBIX_PASSWORD=<Admin's password> bash seed.sh
```

| Item key | What it monitors | Trigger |
| --- | --- | --- |
| `proc.num[open5gs-amfd]` | AMF process alive | Alarm if `= 0` |
| `proc.num[nr-gnb]` | Simulated gNB alive | Alarm if `= 0` |
| `middleware.health` (UserParameter → local `curl` to `http://127.0.0.1:3000/health`) | Provisioning middleware alive | Alarm if no data arrives in 2 min (`nodata()`) |

### The API changed version (Zabbix 7.x)

Two details that break old scripts:

- The `user.login` token no longer goes in the `"auth"` parameter of each call — it goes in the
  `Authorization: Bearer <token>` header.
- `user.update` to change your own password no longer accepts `password`/`current_password`; the
  field names are `passwd` and `current_passwd`:
  ```bash
  curl -s http://127.0.0.1:8080/api_jsonrpc.php -H "Content-Type: application/json-rpc" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"jsonrpc":"2.0","method":"user.update","params":{"userid":"1","current_passwd":"zabbix","passwd":"<new password>"},"id":1}'
  ```

## Test

Stop the gNB (`sudo killall nr-gnb` on the VM) and confirm the Problem **"Simulated gNB down on
oss-lab-vm"** appears (via `problem.get` or in the UI, Problems tab). Bring it back up
([`../ueransim/README.md`](../ueransim/README.md)) and the Problem closes on its own on the next check.
