#!/usr/bin/env bash
set -euo pipefail

cd /opt/hotelos/app
git pull

docker build -t hotelos-ultra:latest .

docker stop hotelos-web hotelos-worker
docker rm hotelos-web hotelos-worker

docker run -d --name hotelos-web --restart unless-stopped --network hotelos-net \
  --env-file /opt/hotelos/app.env -p 127.0.0.1:3000:3000 hotelos-ultra:latest

docker run -d --name hotelos-worker --restart unless-stopped --network hotelos-net \
  --env-file /opt/hotelos/app.env hotelos-ultra:latest npm run worker:start

echo "DEPLOY_DONE"
