#!/usr/bin/env bash
set -euo pipefail

cd /opt/hotelos/app
git pull

docker build -t hotelos-ultra:latest .

# Migrate BEFORE the new code starts serving, not after.
#
# The old order restarted the containers and migrated afterwards, which left a
# window where new code queried a column that did not exist yet. Observed live:
# the follow-up sweep threw "The column Contact.aiPausedAt does not exist" for
# ~30 seconds, from the container restart until the migration landed a moment
# later. Additive migrations are backward-compatible, so applying them while
# the OLD containers are still up is safe — the reverse is not.
#
# Run as a one-off against the freshly built image so it uses the same code
# that is about to serve.
docker run --rm --network hotelos-net --env-file /opt/hotelos/app.env hotelos-ultra:latest npx prisma migrate deploy

docker stop hotelos-web hotelos-worker
docker rm hotelos-web hotelos-worker

# /opt/hotelos/uploads is mounted, not baked into the image, because
# containers are replaced wholesale on every deploy. Without the volume an
# uploaded campaign image would 404 the next time we ship — and a campaign
# scheduled for next week would go out pointing at nothing.
mkdir -p /opt/hotelos/uploads

docker run -d --name hotelos-web --restart unless-stopped --network hotelos-net \
  -v /opt/hotelos/uploads:/app/uploads \
  --env-file /opt/hotelos/app.env -p 127.0.0.1:3000:3000 hotelos-ultra:latest

# The worker sends campaigns, so it needs the same files the web tier wrote.
docker run -d --name hotelos-worker --restart unless-stopped --network hotelos-net \
  -v /opt/hotelos/uploads:/app/uploads \
  --env-file /opt/hotelos/app.env hotelos-ultra:latest npm run worker:start

echo "DEPLOY_DONE"
