#!/usr/bin/env bash
# Read-only look at a server, so the Few Clues move can be planned without anyone
# needing to log in on your behalf. It changes NOTHING and prints NO secrets:
#   - no site names, no config files, no environment variables, no tokens
#   - only: OS, memory/disk, which ports are listening, which common services are
#     running, and Docker container names/images/ports.
# Run it on the server, then paste the whole output back:
#
#   bash survey.sh
#
# (Some lines are richer if you run it with sudo, but it works without.)

echo "== System"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
uname -r
uptime -p 2>/dev/null
nproc 2>/dev/null | sed 's/^/CPU cores: /'

echo
echo "== Memory (MB) and disk"
free -m | awk 'NR==1 || /^Mem|^Swap/'
df -h / | awk 'NR==1 || NR==2'

echo
echo "== Listening ports (TCP)"
ss -ltn 2>/dev/null | awk 'NR>1 {print $4}' | sed 's/.*://' | sort -n | uniq | tr '\n' ' '
echo
echo
for p in 8787 8788; do
  if ss -ltn 2>/dev/null | grep -qE ":$p\s"; then echo "Port $p: IN USE"; else echo "Port $p: free"; fi
done

echo
echo "== Common services (active?)"
for svc in nginx apache2 httpd caddy docker cloudflared fail2ban ufw php-fpm; do
  state="$(systemctl is-active "$svc" 2>/dev/null)"; [ -n "$state" ] && printf '%-12s %s\n' "$svc" "$state"
done
systemctl list-units --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -E '^php[0-9.]*-fpm|^mysql|^mariadb|^postgres' | sed 's/^/db-or-php: /'

echo
echo "== Control panel?"
for d in /usr/local/cpanel /usr/local/psa /usr/local/hestia /usr/local/vesta /usr/local/directadmin /www/server/panel; do
  [ -d "$d" ] && echo "found: $d"
done
echo "(nothing listed above means none of the usual panels was found)"

echo
echo "== Docker"
if command -v docker >/dev/null 2>&1; then
  docker --version 2>/dev/null
  docker compose version 2>/dev/null | head -1
  getent group docker >/dev/null && echo "docker group: exists"
  echo "-- containers (name / image / ports):"
  docker ps --format '{{.Names}} / {{.Image}} / {{.Ports}}' 2>&1 | head -30
else
  echo "Docker is not installed."
fi

echo
echo "== Firewall"
if command -v ufw >/dev/null 2>&1; then
  (ufw status 2>/dev/null || sudo -n ufw status 2>/dev/null) | head -12 || true
  echo "(if this shows nothing, re-run with sudo to see the rules)"
else
  echo "ufw is not installed."
fi
