#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="/tmp/botrade-functions-deploy"

echo "Building packages..."
pnpm --filter @botrade/shared --filter @botrade/functions build

echo "Preparing deploy directory..."
rm -rf "$DEPLOY_DIR"
pnpm deploy --filter @botrade/functions --prod --legacy "$DEPLOY_DIR"

echo "Inlining @botrade/shared..."
mkdir -p "$DEPLOY_DIR/lib/shared"
cp -r "$ROOT_DIR/packages/shared/dist" "$DEPLOY_DIR/lib/shared/"
cp "$ROOT_DIR/packages/shared/package.json" "$DEPLOY_DIR/lib/shared/package.json"

node - <<NODE
const fs = require('fs');
const path = require('path');

const sharedPkgPath = path.join('$DEPLOY_DIR', 'lib/shared/package.json');
const sharedPkg = JSON.parse(fs.readFileSync(sharedPkgPath, 'utf8'));
delete sharedPkg.devDependencies;
delete sharedPkg.scripts;
fs.writeFileSync(sharedPkgPath, JSON.stringify(sharedPkg, null, 2));

const pkgPath = path.join('$DEPLOY_DIR', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies['@botrade/shared'] = 'file:./lib/shared';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
NODE

echo "Cleaning deploy directory..."
rm -rf "$DEPLOY_DIR/src"
rm -f "$DEPLOY_DIR/tsconfig.json"

echo "Copying firebase config..."
cp "$ROOT_DIR/firebase.json" "$DEPLOY_DIR/firebase.json"
cp "$ROOT_DIR/.firebaserc" "$DEPLOY_DIR/.firebaserc"

node - <<NODE
const fs = require('fs');
const path = require('path');

const firebaseJsonPath = path.join('$DEPLOY_DIR', 'firebase.json');
const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
firebaseJson.functions = [{ source: '.', codebase: 'default' }];
fs.writeFileSync(firebaseJsonPath, JSON.stringify(firebaseJson, null, 2));
NODE

echo "Deploying functions..."
cd "$DEPLOY_DIR"
firebase deploy --only functions "$@"
