# owl-api and Owl Studio on Verda (JUN-114)

owl-api runs on a Verda GPU machine in Finland, next to the Nemotron endpoint it calls, so the glasses no longer depend on a laptop and a quick tunnel. Owl Studio is served from the same machine.

| | |
|---|---|
| Machine | Verda `1RTXPRO6000.30V.CC` (1× RTX PRO 6000, 96 GB), FIN-03, Ubuntu 24.04 + CUDA 13.4, on demand (2.89 €/h) |
| owl-api | `https://api.<ip with dashes>.sslip.io` (systemd `owl-api`, restarts by itself) |
| Owl Studio | `https://studio.<ip with dashes>.sslip.io` (Mika's Help console: `/#/help`) |
| Stage view | `https://api.<ip with dashes>.sslip.io/stage` |
| Models | Nemotron 3.5 Super VL on Verda's inference endpoint; V-JEPA 2.1 on this machine's GPU |
| GPU | The `.CC` machines start with the GPU in confidential-computing mode and "not-ready", so CUDA fails (error 802) until `nvidia-smi conf-compute -srs 1`. The `owl-gpu-ready` service does that on every boot, before owl-api |
| Data | `/var/lib/owl/junction` (the Junction story, seeded on the first start) |
| Keys | `/etc/owl/owl-api.env`, copied from your own `apps/owl-api/.env` by `deploy.sh`. Never in the repo |

The address comes from [sslip.io](https://sslip.io): `1-2-3-4.sslip.io` resolves to `1.2.3.4`, and Caddy gets a Let's Encrypt certificate for it. It stays the same as long as the machine keeps its IP, so the iPhone build does not change when owl-api or the machine restarts.

## Deploy or update

From the repo root on your Mac, with the machine's SSH key in `~/.ssh/owl_verda`:

```sh
infra/verda/deploy.sh <machine ip> [git ref]      # ref: main (default) or a branch
```

It copies your keys file (`OWL_ENV_FILE`, default `apps/owl-api/.env`) without printing it, then runs [`setup.sh`](setup.sh) on the machine: Caddy and Node, uv, the checkout of the ref, `uv sync --extra jepa`, the Studio build for the machine's address, the systemd service and the https config. It waits until `/health` says V-JEPA 2.1 is loaded and prints the addresses. Running it again updates everything to the ref and restarts owl-api.

## Point the glasses at it

```sh
cd apps/owl-glasses
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/owl-dev -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> \
  OWL_API_URL=https://api.<ip with dashes>.sslip.io build
xcrun devicectl device install app --device <iPhone UDID> /tmp/owl-dev/Build/Products/Debug-iphoneos/DisplayAccess.app
```

Or on the phone: Owl Boarding → Setup → Server.

## Check it

```sh
curl https://api.<ip with dashes>.sslip.io/health        # Nemotron and "vjepa21 (...)", not "loading"
ssh -i ~/.ssh/owl_verda root@<ip> journalctl -u owl-api -f
```

## Roll back to the laptop

Nothing on the laptop changed. Start owl-api and the tunnel there as in [docs/runbooks/owl-junction-demo.md](../../docs/runbooks/owl-junction-demo.md), and point the phone at the tunnel (Setup → Server, or a build with that `OWL_API_URL`).

## Stop paying

The machine costs 2.89 €/h while it exists. Delete it in the Verda console (Instances → owl-api → Delete). Deleting loses the IP, so a new machine gets a new address and the phone a new build.
