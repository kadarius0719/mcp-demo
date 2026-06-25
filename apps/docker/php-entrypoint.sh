#!/bin/sh
set -e
cd /app

# Install PHP deps into the (fast) named volume on first boot.
if [ ! -f vendor/autoload_runtime.php ]; then
  echo "[entrypoint] composer install…"
  composer install --no-interaction --no-progress --no-scripts
fi

# Create the SQLite schema (and seed, if a command is provided) once.
mkdir -p var
if [ ! -f var/data.db ]; then
  echo "[entrypoint] creating SQLite schema…"
  php bin/console doctrine:database:create --if-not-exists --no-interaction || true
  php bin/console doctrine:schema:create --no-interaction
  if [ -n "$SEED_CMD" ]; then
    echo "[entrypoint] seeding via: $SEED_CMD"
    php bin/console $SEED_CMD --no-interaction || true
  fi
fi

echo "[entrypoint] serving on http://0.0.0.0:8000"
exec php -S 0.0.0.0:8000 -t public public/index.php
