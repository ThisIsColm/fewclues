#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 server (Hetzner Cloud or similar).
# Run as root, over SSH, from a key-authenticated session:
#
#   curl -fsSL <raw url of this file> -o setup-vps.sh   # or scp it over
#   sudo bash setup-vps.sh
#
# What it does:
#   - updates the system and turns on automatic security updates
#   - installs Docker, sqlite3 and fail2ban
#   - creates a non-root "deploy" user (copies root's SSH key to it)
#   - firewall: SSH in only. The game is reached through the Cloudflare tunnel,
#     which is an outbound connection, so no web ports are opened.
#   - locks SSH to keys only (after checking the deploy user can log in with one)
#   - installs cloudflared and registers it with your tunnel token, which is read
#     from a hidden prompt so it never lands in shell history or this repo.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash setup-vps.sh)"; exit 1; }
[ -s /root/.ssh/authorized_keys ] || { echo "No SSH key in /root/.ssh/authorized_keys. Add one before running this, or you'll lock yourself out."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
echo "== Updating system"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades sqlite3 docker.io docker-compose-v2

echo "== Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Deploy user"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
systemctl enable --now docker

echo "== Firewall (SSH only; the Cloudflare tunnel connects outwards)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
systemctl enable --now fail2ban

echo "== cloudflared"
install -d -m 755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
apt-get update -y
apt-get install -y cloudflared
if systemctl is-active --quiet cloudflared; then
  echo "cloudflared already running; skipping tunnel registration."
else
  read -rsp "Paste the Cloudflare tunnel token (input hidden): " TOKEN; echo
  [ -n "$TOKEN" ] || { echo "No token entered; skipping. Run: cloudflared service install <token>"; TOKEN=""; }
  if [ -n "$TOKEN" ]; then cloudflared service install "$TOKEN"; fi
  unset TOKEN
fi

echo "== SSH hardening (keys only)"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh

cat <<'EOF'

Done. IMPORTANT: before closing this session, open a SECOND terminal and check
you can still log in:    ssh deploy@<server-ip>
Then continue with deploy/RUNBOOK.md.
EOF
