#!/bin/sh
set -e

# Export APP_VERSION from package.json
export APP_VERSION=$(node -p "require('./package.json').version")

echo "Running database migrations..."
node ace migration:run --force

echo "Starting AdonisJS server..."
exec "$@"
