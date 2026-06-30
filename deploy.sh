#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define deployment variables
PORT=3000
APP_NAME="secure-vault"

echo "=== Starting deployment for $APP_NAME on port $PORT ==="

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Build the PWA
echo "Building the application..."
npm run type-check
npm run build

# 3. Deploy via PM2
echo "Deploying application via PM2..."
# Delete old instance if it exists to avoid port/name conflicts
pm2 delete "$APP_NAME" 2>/dev/null || true

# Start the built dist folder using PM2's built-in static file server with SPA routing routing (fallback to index.html)
pm2 start --name "$APP_NAME" serve -- ./dist $PORT --spa

# Save the PM2 process list to load on reboot
pm2 save

echo "=== Deployment completed successfully! App is running on port $PORT ==="
