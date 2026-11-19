# Moving Few Clues to a Hetzner VPS

About 1–2 hours, and **no downtime** if you follow the cutover order (the Cloudflare
tunnel runs on both machines for a few minutes, then you stop the old one).

## 0. Before you start

- **Code location.** The repo only exists on the home server. Work is on the
  `clue-ladder` branch; `main` still holds the old percentage game. Either merge
  `clue-ladder` into `main` first, or deploy that branch. Push to a *private* remote
  (GitHub or similar) so the VPS can `git clone` / `git pull`.
- **Secrets.** Never put the tunnel token in the repo, in chat, or in a script. It
  goes in only through the hidden prompt in `setup-vps.sh`.

## 1. Create the server (Hetzner Cloud console)

- Image: **Ubuntu 24.04**. Type: the smallest shared-CPU plan with about 2 GB RAM is
  plenty (the game idles around 21 MB; the extra memory is for building the image).
- Location: any EU site (Cloudflare sits in front, so players barely notice).
- Add your **SSH public key** in the console (no password).
- Cloud Firewall (optional, extra layer): allow inbound **TCP 22** only.
- Optional: enable Hetzner **Backups** (whole-server snapshots). They are in addition
  to the database backups below, not a replacement.

## 2. One-time server setup

```sh
scp deploy/setup-vps.sh root@<server-ip>:
ssh root@<server-ip> 'bash setup-vps.sh'
```

Paste the tunnel token when asked (get it from Cloudflare: Zero Trust → Networks →
Tunnels → game-tunnel → *Configure* → the token in the install command).
**Check in a second terminal** that `ssh deploy@<server-ip>` works before closing the first.

> Adding a second `cloudflared` to the same tunnel is how the no-downtime cutover
> works: Cloudflare sends traffic to whichever connector is up. The route's service URL
> stays `http://localhost:8787` on both machines.

## 3. Get the code and start the game (on the VPS, as `deploy`)

```sh
git clone <your-private-repo> fewclues && cd fewclues
git checkout <branch>            # clue-ladder, or main once merged
docker compose build             # runs content validation + tests as part of the build
docker compose up -d
curl -s localhost:8787/api/health
```

The compose file already binds the game to `127.0.0.1:8787` only, so nothing is exposed
except through the tunnel.

Settings live in `docker-compose.yml`. To override without editing it, create `.env`
beside it, for example:

```sh
ALLOW_DRAFTS=0     # once every round in content/rounds.json is "approved"
```

(`ALLOW_DRAFTS` defaults to `1` for now, because the rounds are still drafts.
Turning it off with draft rounds loads zero puzzles, so review and approve first.)

## 4. Data: start fresh, or bring the beta data

**Start fresh** (simplest): do nothing, the VPS creates an empty database.

**Bring the beta data** (on the home server, then the VPS):

```sh
# home server
docker exec fewclues node -e "require('better-sqlite3')('/data/fewclues.db',{readonly:true}).backup('/data/move.db').then(()=>process.exit(0))"
docker cp fewclues:/data/move.db ./move.db && docker exec fewclues rm /data/move.db
scp move.db deploy@<server-ip>:

# VPS: stop the game, drop the file in the volume, start again
cd ~/fewclues && docker compose down
docker run --rm -v fewclues-data:/data -v "$HOME":/in alpine sh -c 'cp /in/move.db /data/fewclues.db && rm -f /data/fewclues.db-wal /data/fewclues.db-shm && chown 1000:1000 /data/fewclues.db'
docker compose up -d && rm ~/move.db
```

## 5. Check the VPS copy before switching

The tunnel now has two connectors, so some live traffic may already reach the VPS.
Confirm it behaves: `curl -s localhost:8787/api/today | head -c 300`, and open
https://fewclues.app a few times. In Cloudflare → Tunnels you should see **2 replicas**.

## 6. Cut over

Stop the old connector on the home server, so all traffic goes to the VPS:

```sh
sudo systemctl stop cloudflared && sudo systemctl disable cloudflared
```

Keep the home copy of the game stopped but not deleted for a week as a fallback
(`docker compose stop`). To roll back: `sudo systemctl enable --now cloudflared` there.

## 7. Backups and monitoring (do not skip)

```sh
mkdir -p ~/backups && chmod +x ~/fewclues/deploy/backup.sh
crontab -e     # add:
# 17 3 * * *  /home/deploy/fewclues/deploy/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

- Test it once by hand: `~/fewclues/deploy/backup.sh`, and restore it somewhere to be sure:
  `gunzip -c ~/backups/fewclues-*.db.gz | sqlite3 /tmp/check.db 'select count(*) from completions'`.
- Keep a copy **off the server**: set `BACKUP_REMOTE` (a Hetzner Storage Box works
  well with rsync over SSH).
- Add a free uptime check (UptimeRobot, Better Stack…) on `https://fewclues.app/api/health`.

## 8. Updating the game later

```sh
cd ~/fewclues && git pull && docker compose build && docker compose up -d
```

New puzzle rounds are just `content/rounds.json`: `git pull` is enough, the server
re-reads it within 30 seconds (no restart).

## Restoring from a backup

```sh
cd ~/fewclues && docker compose down
gunzip -c ~/backups/fewclues-<stamp>.db.gz > ~/restore.db
docker run --rm -v fewclues-data:/data -v "$HOME":/in alpine sh -c 'cp /in/restore.db /data/fewclues.db && rm -f /data/fewclues.db-wal /data/fewclues.db-shm && chown 1000:1000 /data/fewclues.db'
docker compose up -d
```
