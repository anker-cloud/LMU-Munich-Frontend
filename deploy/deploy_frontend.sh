#!/bin/bash
# Deploy a new dashboard build on the frontend EC2 (i-0a8f77cfb7c978d82).
#
#   sudo bash deploy_frontend.sh <bundle.tar.gz URL or path> <tag>
#
# The bundle holds the Vite build (dist/) and nginx.conf, built elsewhere with
# `npm run build` (this instance has little disk space for a Node build).
# Steps: unpack → small nginx image neuroai-frontend-prod:<tag> → stop the
# running container and keep it as ki-alz-frontend_prev → start the new one →
# check it serves the app; roll back automatically if not.
# DRY_RUN=1 builds the image only (rehearsal). Undo with rollback_frontend.sh.
set -euo pipefail

BUNDLE=${1:?usage: deploy_frontend.sh <bundle URL or path> <tag>}
TAG=${2:?usage: deploy_frontend.sh <bundle URL or path> <tag>}
WORK=$(mktemp -d /tmp/frontend_$TAG.XXXX)
trap 'rm -rf "$WORK"' EXIT

echo "== 1. unpack bundle"
case "$BUNDLE" in
  http*) curl -sf -o "$WORK/bundle.tar.gz" "$BUNDLE" ;;
  *)     cp "$BUNDLE" "$WORK/bundle.tar.gz" ;;
esac
tar -xzf "$WORK/bundle.tar.gz" -C "$WORK"
[ -f "$WORK/dist/index.html" ] && [ -f "$WORK/nginx.conf" ] || { echo "bundle must contain dist/ and nginx.conf"; exit 1; }

echo "== 2. build neuroai-frontend-prod:$TAG"
cat > "$WORK/Dockerfile" <<'EOF'
FROM nginx:alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF
docker build -q -t "neuroai-frontend-prod:$TAG" "$WORK" >/dev/null

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "== DRY_RUN: image built, stopping before the swap; production untouched"; exit 0
fi

echo "== 3. swap containers"
docker rm -f ki-alz-frontend_prev >/dev/null 2>&1 || true
if docker ps -a --format '{{.Names}}' | grep -qx ki-alz-frontend; then
  docker stop ki-alz-frontend >/dev/null
  docker rename ki-alz-frontend ki-alz-frontend_prev
fi
docker run -d --name ki-alz-frontend -p 80:80 --restart unless-stopped "neuroai-frontend-prod:$TAG" >/dev/null

echo "== 4. check"
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ || true); [ "$code" = "200" ] && break; sleep 2
done
if [ "$code" = "200" ] && curl -s http://127.0.0.1/ | grep -q '<div id="root">'; then
  echo "   dashboard served (HTTP 200)"
else
  echo "   check failed (HTTP $code), rolling back"; bash "$(dirname "$0")/rollback_frontend.sh"; exit 1
fi
echo "== done: neuroai-frontend-prod:$TAG running; previous container kept as ki-alz-frontend_prev (stopped)"
