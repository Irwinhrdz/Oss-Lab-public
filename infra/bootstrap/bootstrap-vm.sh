#!/usr/bin/env bash
# Preparación base de la VM OSS (Oracle Cloud ARM, 1 OCPU / 6 GB).
# Idempotente: puede volver a correrse sin duplicar el swap ni reinstalar Docker.
set -euo pipefail

echo "==> Actualizando paquetes del sistema"
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential cmake

if [ ! -f /swapfile ]; then
  echo "==> Creando swap de 2 GB"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
else
  echo "==> Swap ya existe, se omite"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker + Compose"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Cierra sesión y vuelve a entrar para que el grupo docker tenga efecto."
else
  echo "==> Docker ya está instalado, se omite"
fi

echo "==> Listo. Siguiente paso: infra/open5gs/README.md"
