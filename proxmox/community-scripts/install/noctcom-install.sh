#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: RedderLabs
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://noctcom.com

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y \
  git \
  openssl \
  ca-certificates
msg_ok "Installed Dependencies"

msg_info "Installing Docker"
$STD sh <(curl -fsSL https://get.docker.com)
msg_ok "Installed Docker"

msg_info "Cloning Noctcom"
$STD git clone --depth 1 https://github.com/RedderLabs/noctcom.git /opt/noctcom
msg_ok "Cloned Noctcom"

# Zero-knowledge stack (PostgreSQL + Redis + MinIO + Fastify API + Next.js +
# Caddy). LAN mode by default: app on http://<IP>, API on http://<IP>:3000, no
# TLS. The same steps the upstream install.sh runs for the no-domain path.
msg_info "Configuring Noctcom"
cd /opt/noctcom
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
cp .env.example .env
set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
set_env CADDY_DOMAIN localhost
set_env CADDY_EMAIL admin@localhost
set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_env REDIS_PASSWORD "$(openssl rand -hex 24)"
set_env MINIO_ROOT_PASSWORD "$(openssl rand -hex 24)"
set_env JWT_SECRET "$(openssl rand -base64 64 | tr -d '\n')"
set_env PUBLIC_URL "http://${LAN_IP}:3000"
set_env PUBLIC_API_URL "http://${LAN_IP}:3000"
set_env FRONTEND_URL "http://${LAN_IP}"
set_env SMTP_FROM noreply@localhost
# COMPOSE_FILE: never the dev override; add the LAN compose file (HTTP by IP).
echo "COMPOSE_FILE=docker-compose.yml:docker-compose.lan.yml" >>.env
chmod 600 .env
echo "${LAN_IP}" >/opt/noctcom/.lan_ip
msg_ok "Configured Noctcom (LAN mode, IP ${LAN_IP})"

msg_info "Building and starting Noctcom (Patience — the first build takes a few minutes)"
$STD docker compose up -d --build
msg_ok "Started Noctcom"

motd_ssh
customize

msg_info "Cleaning up"
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Cleaned"
