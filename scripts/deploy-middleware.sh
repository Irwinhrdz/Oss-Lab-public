#!/usr/bin/env bash
# Sincroniza middleware/ hacia la instancia OSS y lo levanta con Docker Compose.
# El .env del servidor NUNCA se sobreescribe desde aquí (tiene los secretos reales).
set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/oss-lab-vm.key}"
REMOTE="${REMOTE:-ubuntu@<ip-de-tu-vm>}"
REMOTE_PATH="${REMOTE_PATH:-/home/ubuntu/oss-lab-middleware}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Sincronizando middleware hacia ${REMOTE}:${REMOTE_PATH}"
ssh -i "$SSH_KEY" "$REMOTE" "mkdir -p '$REMOTE_PATH'"
rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  -e "ssh -i $SSH_KEY" \
  "$SCRIPT_DIR/../middleware/" "$REMOTE:$REMOTE_PATH/"

echo "==> Construyendo y levantando el contenedor"
ssh -i "$SSH_KEY" "$REMOTE" "cd '$REMOTE_PATH' && test -f .env || echo 'AVISO: falta .env en el servidor, copia .env.example y complétalo con los secretos reales'"
ssh -i "$SSH_KEY" "$REMOTE" "cd '$REMOTE_PATH' && docker compose up -d --build"

echo "==> Verificando /health"
ssh -i "$SSH_KEY" "$REMOTE" "curl -fsS http://localhost:3000/health || echo 'El servicio no respondió en /health'"
