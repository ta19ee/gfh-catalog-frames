#!/bin/sh
# Puts everything that changes on the Fly volume (/data) and links it into the app:
#   /data/config.json      settings (Studio saves here)
#   /data/themes/*.js      theme files (THEMES_DIR)
#   /data/layers/          uploaded layer images (assets/layers)
#   /data/public/          images, feeds, manifest, price history (served to Meta)
#   /data/data/            products.json
# Files from the image are copied only when missing, so Studio changes survive deploys;
# new themes or layer images added in the repo appear after the next deploy.
set -e
D=${DATA_DIR:-/data}
mkdir -p "$D/themes" "$D/layers" "$D/public/img" "$D/data" "$D/previews"

[ -f "$D/config.json" ] || cp /app/config.json "$D/config.json"
for f in /app/src/themes/*.js; do
  case "$(basename "$f")" in _*) continue ;; esac
  [ -f "$D/themes/$(basename "$f")" ] || cp "$f" "$D/themes/"
done
if [ -d /app/assets/layers ] && [ ! -L /app/assets/layers ]; then
  cp -n /app/assets/layers/* "$D/layers/" 2>/dev/null || true
  rm -rf /app/assets/layers
fi

ln -sfn "$D/config.json" /app/config.json.live && mv -f /app/config.json.live /app/config.json
ln -sfn "$D/layers" /app/assets/layers
rm -rf /app/public /app/data /app/previews
ln -sfn "$D/public" /app/public
ln -sfn "$D/data" /app/data
ln -sfn "$D/previews" /app/previews

exec "$@"
