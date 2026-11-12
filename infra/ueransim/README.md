# UERANSIM — simulated gNB and UE

Simulates the radio base station (gNB) and the phone (UE). Success looks like seeing the
`uesimtun0` interface come up with an IP and being able to ping through it. Full detail:
[`../../Lab OSS BSS de la venta a la red.md`](../../Lab%20OSS%20BSS%20de%20la%20venta%20a%20la%20red.md) · Step 2.

## Build

```bash
sudo apt install -y make gcc g++ libsctp-dev lksctp-tools iproute2
git clone https://github.com/aligungr/UERANSIM.git
cd UERANSIM && make
```

## Configuration

- `config/open5gs-gnb.yaml` — see [`open5gs-gnb.example.yaml`](./open5gs-gnb.example.yaml): `linkIp`,
  `ngapIp`, `gtpIp` and `amfConfigs` must point to the OSS VM's private IP.
- `config/open5gs-ue.yaml` — see [`open5gs-ue.example.yaml`](./open5gs-ue.example.yaml): `supi`, `key`
  and `op` must match exactly the subscriber created in Open5GS (`opType: OPC`). If the UE fails with
  an authentication error, it's almost always K/OPc mismatching between MongoDB and the yaml.

## Internet access for the UEs

**Run `net-fixup.sh` BEFORE bringing up `nr-ue`** (and after every VM reboot, since these are live
adjustments that don't survive a reboot):

```bash
sudo bash net-fixup.sh
```

The script does more than `ip_forward` + `MASQUERADE` because in this lab (everything on one VM,
UPF and UE sharing a kernel) that simple combination **isn't enough**. Three real problems it fixes,
from most to least obvious:

1. **Docker sets `FORWARD` to `DROP`** on install — without an exception in `DOCKER-USER` for the
   `ogstun` interface, no packet from the UPF gets forwarded.
2. **`MASQUERADE` doesn't work here** — with the routing table `nr-ue` creates for itself, `MASQUERADE`
   fails to resolve the outgoing interface's IP and ends up translating nothing (confirmed with
   `conntrack -E`: the expected response still pointed at the UE's IP, never at the VM's). Explicit
   `SNAT` is used instead, and **only** on the real WAN interface — applying it also on the first local
   hop (`uesimtun0`) corrupts the packet before it reaches the UPF.
3. **`conntrack` "freezes" the NAT decision** the first time it sees the packet (when it leaves
   locally via `uesimtun0`, where no NAT rule applies) and doesn't re-evaluate it when the same packet
   reappears via `ogstun`/the WAN interface (where the SNAT should apply). This is fixed with `NOTRACK`
   on the first hop, so conntrack only starts tracking the packet once it arrives via `ogstun`.

In addition, the per-process routing rule `nr-ue` creates for itself (table `rt_uesimtun0`) uses a
priority that varies between runs (0, 99, and 32765 have been observed), and if it "wins" that race,
traffic loops between `ogstun` and `uesimtun0` (visible as `Time to live exceeded` on ping). That's why
the script adds its own priority-0 rule **before** bringing up `nr-ue` — it needs to be first at that
priority, not just have a low number.

## Startup and test

```bash
sudo bash net-fixup.sh                          # once per VM reboot
./build/nr-gnb -c config/open5gs-gnb.yaml       # terminal 1
sudo ./build/nr-ue -c config/open5gs-ue.yaml    # terminal 2
```

**To test, use the UE's IP, not the interface name:**

```bash
sudo ping -I 10.45.0.2 8.8.8.8      # YES: bind by address — works
sudo ping -I uesimtun0 8.8.8.8      # NO: from this same VM, never gets a response
```

Reason: the UE's IP (`10.45.0.x`) ends up registered in the kernel's `local` table because the
interface lives on this same host. When the response from the Internet genuinely arrives (confirmable
with `tcpdump -i enp0s6 icmp`, you can see the response coming in), the kernel delivers it "locally"
instead of forwarding it via `ogstun`→`uesimtun0`, and the `ping -I uesimtun0` socket (which uses
`SO_BINDTODEVICE`) discards it because it arrived via the physical interface, not via `uesimtun0`. By
binding by **address** instead of by **interface**, `ping` doesn't filter by arrival interface and does
receive it. A real UE (not on this same VM) doesn't have this problem.
