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
$STD apt install -y \
  git \
  openssl \
  ca-certificates
msg_ok "Installed Dependencies"

msg_info "Installing Docker"
$STD sh <(curl -fsSL https://get.docker.com)
msg_ok "Installed Docker"

msg_info "Installing Noctcom (Patience — builds the full stack)"
# Official installer: clones the repo to /opt/noctcom, generates .env with
# random secrets and starts the stack (PostgreSQL + Redis + MinIO + backend +
# frontend + Caddy) via Docker Compose. Without NOCTCOM_DOMAIN it configures
# LAN mode: app on http://<IP>, API on http://<IP>:3000 (no TLS).
export NOCTCOM_DIR=/opt/noctcom
export NOCTCOM_NONINTERACTIVE=1
$STD bash <(curl -fsSL https://raw.githubusercontent.com/RedderLabs/noctcom/main/install.sh)
msg_ok "Installed Noctcom"

motd_ssh
customize
cleanup_lxc
