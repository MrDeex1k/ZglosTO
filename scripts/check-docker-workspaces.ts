import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function checkDockerWorkspaces(root = '.'): void {
  const manifest = (directory: string): Manifest =>
    JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8')) as Manifest;
  const packages = new Map(
    readdirSync(join(root, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directory = `packages/${entry.name}`;
        return [manifest(directory).name, directory];
      }),
  );
  for (const service of ['backend', 'authorization', 'frontend', 'llm_gateway']) {
    const dockerfile = readFileSync(join(root, service, 'Dockerfile'), 'utf8');
    const allowlist = readFileSync(join(root, service, 'Dockerfile.dockerignore'), 'utf8').split(
      /\r?\n/u,
    );
    const visited = new Set<string>();
    const visit = (directory: string): void => {
      if (visited.has(directory)) return;
      visited.add(directory);
      const value = manifest(directory);
      for (const [name, version] of Object.entries({
        ...value.devDependencies,
        ...value.dependencies,
      })) {
        if (!version.startsWith('workspace:')) continue;
        const dependency = packages.get(name);
        if (dependency === undefined) throw new Error(`Unknown workspace dependency: ${name}`);
        // Docker contexts deliberately use explicit allowlists, not a broad packages/**.
        for (const required of [`!${dependency}/`, `!${dependency}/**`]) {
          if (!allowlist.includes(required)) {
            throw new Error(
              `${service}/Dockerfile.dockerignore excludes ${name}: missing ${required}`,
            );
          }
        }
        if (!dockerfile.includes(`COPY ${dependency}/package.json ${dependency}/package.json`)) {
          throw new Error(`${service}/Dockerfile does not copy ${name}'s manifest before install`);
        }
        visit(dependency);
      }
    };
    visit(service);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkDockerWorkspaces();
  console.log('Docker workspace contexts include all transitive workspace dependencies.');
}
