#!/bin/bash
# Deploys or updates owl-api and Owl Studio on a Verda machine (JUN-114). Runs on your Mac.
#
#   infra/verda/deploy.sh <machine ip> [git ref]       (ref defaults to main)
#
# Copies apps/owl-api/.env (your keys) to the machine as /etc/owl/owl-api.env without printing it, then runs
# setup.sh there. The machine must have the SSH key OWL_SSH_KEY (default ~/.ssh/owl_verda).
set -euo pipefail

IP="${1:?usage: deploy.sh <machine ip> [git ref]}"
REF="${2:-main}"
KEY="${OWL_SSH_KEY:-$HOME/.ssh/owl_verda}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "root@${IP}")

"${SSH[@]}" "mkdir -p /etc/owl /tmp/owl-setup"
scp -q -i "$KEY" "$ROOT/apps/owl-api/.env" "root@${IP}:/etc/owl/owl-api.env"
scp -q -i "$KEY" "$ROOT/infra/verda/setup.sh" "root@${IP}:/tmp/owl-setup/setup.sh"
"${SSH[@]}" "bash /tmp/owl-setup/setup.sh '${REF}'"
