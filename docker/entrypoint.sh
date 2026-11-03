#!/bin/sh
# Start-up: apply database migrations, then start the app.
set -e

echo "Applying database migrations..."
cd /migrate
tries=0
until node node_modules/prisma/build/index.js migrate deploy; do
  tries=$((tries + 1))
  if [ "$tries" -ge 10 ]; then
    echo "Database migrations failed after $tries attempts. Is DATABASE_URL correct and the database running?"
    exit 1
  fi
  echo "Database not ready yet; retrying in 3 seconds ($tries/10)..."
  sleep 3
done

echo "Starting the app on port ${PORT:-3000}..."
cd /app
exec node server.js
