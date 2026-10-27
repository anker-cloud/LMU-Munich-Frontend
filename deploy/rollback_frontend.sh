#!/bin/bash
# Go back to the previous dashboard container kept by deploy_frontend.sh.
#
#   sudo bash rollback_frontend.sh
set -euo pipefail

docker ps -a --format '{{.Names}}' | grep -qx ki-alz-frontend_prev || { echo "no ki-alz-frontend_prev container to roll back to"; exit 1; }
docker rm -f ki-alz-frontend >/dev/null 2>&1 || true
docker rename ki-alz-frontend_prev ki-alz-frontend
docker start ki-alz-frontend >/dev/null
echo "rolled back to $(docker inspect ki-alz-frontend --format '{{.Config.Image}}'), HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
