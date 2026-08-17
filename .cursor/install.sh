#!/usr/bin/env bash
# Durable Cloud Agent install: Docker, pnpm deps, local .env, pgvector image.
# Must be idempotent, non-interactive, and terminate. Do not leave services running.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APT_INSTALL=(
  apt-get install -y
  -o Dpkg::Options::=--force-confdef
  -o Dpkg::Options::=--force-confold
)

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /workspace)"

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker already installed"
    return 0
  fi

  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive "${APT_INSTALL[@]}" ca-certificates curl gnupg fuse-overlayfs iptables
  sudo install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl --retry 3 --retry-delay 5 -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive "${APT_INSTALL[@]}" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

configure_nested_docker() {
  sudo mkdir -p /etc/docker
  if [ ! -f /etc/docker/daemon.json ]; then
    sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "storage-driver": "fuse-overlayfs",
  "features": {
    "containerd-snapshotter": false
  }
}
EOF
  fi
  sudo update-alternatives --set iptables /usr/sbin/iptables-legacy || true
  sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy || true
  sudo groupadd -f docker
  sudo usermod -aG docker ubuntu || true
}

start_dockerd_temporarily() {
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  sudo service docker start >/dev/null 2>&1 || true
  if sudo docker info >/dev/null 2>&1; then
    return 0
  fi
  sudo dockerd >/tmp/dockerd.install.log 2>&1 &
  for _ in $(seq 1 30); do
    if sudo docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "dockerd failed to start during install" >&2
  tail -n 50 /tmp/dockerd.install.log >&2 || true
  return 1
}

stop_temporary_dockerd() {
  sudo service docker stop >/dev/null 2>&1 || true
  sudo pkill -x dockerd >/dev/null 2>&1 || true
}

ensure_env_file() {
  if [ -f .env ]; then
    return 0
  fi
  cp .env.example .env
  local key
  key="$(openssl rand -hex 32)"
  sed -i "s/change-me-to-a-long-random-string/${key}/" .env
}

source_env_on_login() {
  local marker="# foundation-cloud-env"
  if grep -q "$marker" /home/ubuntu/.bashrc 2>/dev/null; then
    return 0
  fi
  cat >> /home/ubuntu/.bashrc <<'EOF'

# foundation-cloud-env
if [ -f /workspace/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /workspace/.env
  set +a
fi
EOF
}

install_docker
configure_nested_docker
corepack enable
corepack prepare pnpm@10.33.3 --activate
pnpm install --frozen-lockfile
ensure_env_file
source_env_on_login
trap 'stop_temporary_dockerd' EXIT
start_dockerd_temporarily
sudo docker pull pgvector/pgvector:pg16
echo "install complete"
