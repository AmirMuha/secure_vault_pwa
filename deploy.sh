#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

APP_NAME="secure-vault"

echo "=== Starting deployment for $APP_NAME ==="

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Build the PWA
echo "Building the application..."
npm run type-check
npm run build

echo "=== Build completed successfully! Nginx will now serve the static assets directly. ==="
