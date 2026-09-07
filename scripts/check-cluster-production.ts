import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function resource(rendered: string, kind: string, name: string, optional = false): string {
  const result = rendered
    .split(/^---\s*$/mu)
    .find(
      (document) =>
        new RegExp(`^kind: ${kind}$`, 'mu').test(document) &&
        new RegExp(`^  name: ${name}$`, 'mu').test(document),
    );
  if (!result && !optional) throw new Error(`Missing ${kind}/${name}`);
  return result ?? '';
}

export function checkClusterProduction(rendered: string, ha = false): void {
  if (
    rendered.includes('ingressClassName: nginx') ||
    rendered.includes('nginx.ingress.kubernetes.io/')
  ) {
    throw new Error('The retired ingress-nginx controller is not supported. Use Traefik.');
  }
  for (const name of ['backend', 'authorization']) {
    const deployment = resource(rendered, 'Deployment', name);
    const hpa = resource(rendered, 'HorizontalPodAutoscaler', `${name}-hpa`, true);
    const replicas = Number(/^  replicas: (\d+)$/mu.exec(deployment)?.[1] ?? 1);
    const maximum = Number(/^  maxReplicas: (\d+)$/mu.exec(hpa)?.[1] ?? replicas);
    if (
      Math.max(replicas, maximum) > 1 &&
      !/name: REDIS_MODE\n\s+value: (?:external|local)\s*$/mu.test(deployment)
    ) {
      throw new Error(`${name}: multiple replicas require the local or external Redis component`);
    }
  }
  if (ha) {
    for (const name of ['backend', 'authorization', 'frontend', 'nginx', 'pgbouncer']) {
      const deployment = resource(rendered, 'Deployment', name);
      if (Number(/^  replicas: (\d+)$/mu.exec(deployment)?.[1] ?? 1) < 2) {
        throw new Error(`${name}: HA requires at least two replicas`);
      }
      const hpa = resource(rendered, 'HorizontalPodAutoscaler', `${name}-hpa`, true);
      if (hpa && Number(/^  minReplicas: (\d+)$/mu.exec(hpa)?.[1] ?? 1) < 2) {
        throw new Error(`${name}: HA autoscaling must keep at least two replicas`);
      }
      if (!deployment.includes('whenUnsatisfiable: DoNotSchedule')) {
        throw new Error(`${name}: HA requires strict spreading across nodes`);
      }
    }
    for (const name of ['database', 'rabbitmq']) {
      const workload = resource(rendered, 'StatefulSet', name);
      const classes = [...workload.matchAll(/storageClassName: (\S+)/gu)].map((match) => match[1]);
      if (!classes.length || classes.some((storageClass) => storageClass !== 'zglosto-ha')) {
        throw new Error(`${name}: HA requires replicated zglosto-ha storage`);
      }
    }
    const storage = resource(rendered, 'StorageClass', 'zglosto-ha');
    if (
      !storage.includes('provisioner: driver.longhorn.io') ||
      !/^  numberOfReplicas: (?:"3"|'3')\s*$/mu.test(storage) ||
      !storage.includes('replicaSoftAntiAffinity: disabled') ||
      !storage.includes('reclaimPolicy: Retain')
    ) {
      throw new Error('HA storage must retain data and use three Longhorn replicas');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const overlay = process.argv[2];
  if (!overlay) throw new Error('Usage: node scripts/check-cluster-production.ts OVERLAY [--ha]');
  const rendered = execFileSync('kubectl', ['kustomize', overlay], { encoding: 'utf8' });
  checkClusterProduction(rendered, process.argv.includes('--ha'));
  console.log(`Cluster production policy passed: ${overlay}`);
}
