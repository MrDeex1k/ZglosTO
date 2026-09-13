#!/bin/sh
# Run inside the disposable phase-1 image, with its populated Bun cache.
set -eu
staging="$(mktemp -d /tmp/zglosto-bun-staging.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
cp package.json bun.lock bunfig.toml "$staging/"
for workspace in backend authorization llm_gateway packages/*; do
  mkdir -p "$staging/$workspace"
  cp "$workspace/package.json" "$staging/$workspace/"
  cp -R "$workspace/dist" "$staging/$workspace/"
done
cd "$staging"
bun install --frozen-lockfile --production --ignore-scripts --offline --filter 'backend-zglosto...' --filter 'authorization-zglosto...' --filter 'llm-gateway-zglosto...'
bun -e '
const fs = require("node:fs");
const path = require("node:path");
const {createRequire} = require("node:module");
let imports = 0;
for (const service of ["backend","authorization","llm_gateway"]) {
  const manifest = JSON.parse(fs.readFileSync(service + "/package.json","utf8"));
  const local = createRequire(path.resolve(service + "/package.json"));
  for (const name of Object.keys(manifest.dependencies)) {
    await import(local.resolve(name)); imports++;
  }
}
for (const workspace of [".","backend","authorization","llm_gateway"]) {
  for (const name of ["typescript","vitest","expo"]) {
    if (fs.existsSync(workspace + "/node_modules/" + name)) throw new Error("Unexpected toolchain package: " + workspace + "/" + name);
  }
}
function inspect(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir,name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      const target = fs.realpathSync(file);
      if (!target.startsWith(process.cwd()+"/")) throw new Error("External link: " + file);
    } else if (stat.isDirectory()) inspect(file);
  }
}
inspect(".");
console.log(JSON.stringify({probe:"production-staging",imports,status:"PASS"}));
'
