# Scoped object storage identities

Local RustFS uses four distinct access keys and four distinct secrets:

| Identity   | Production files under `ZTO_SECRETS_DIR`                         | Consumers                              |
| ---------- | ---------------------------------------------------------------- | -------------------------------------- |
| Root       | `rustfs-root-access-key`, `rustfs-root-secret-key`               | RustFS and one-shot IAM bootstrap only |
| API        | `s3-access-key-id`, `s3-secret-access-key`                       | backend and bootstrap                  |
| Worker     | `s3-worker-access-key-id`, `s3-worker-secret-access-key`         | media worker and bootstrap             |
| Operations | `s3-operations-access-key-id`, `s3-operations-secret-access-key` | one-off audit/archive and bootstrap    |

The official digest-pinned `rustfs/rc:v0.1.37` creates the bucket and reconciles IAM
users and named policies. It is a pulled tool, not a ninth application image.
Credentials must be readable by the container's declared UID/group; Compose file
secrets are bind mounts, so arrange host ownership/group access rather than relying
on Compose `uid`/`gid` remapping. Never enable shell tracing for provisioning.
Root/client configuration exists only in bootstrap's private tmpfs and is removed
on exit. IAM failures prevent dependent runtime workloads from starting in Compose.

Policies grant `ListBucket` and `GetBucketLocation` for exactly one bucket and
`GetObject`, `PutObject`, `DeleteObject` for exactly `S3_OBJECT_PREFIX/*`.
The nonempty ASCII prefix cannot contain wildcards, quotes or parent segments.
Listing the one bucket is a deliberate compromise for HeadBucket/readiness and the
existing adapter; it can reveal names outside the prefix, but cannot read their
contents. Runtime needs delete for replacement cleanup. Operations has the same
bucket/prefix scope for archive/restore, with separately revocable credentials.
No identity gets `s3:*`, `admin:*`, bucket creation, bucket policy writes, other
buckets or objects outside the prefix. Bucket creation belongs exclusively to root
bootstrap. `S3_AUTO_CREATE_BUCKET=true` is rejected by runtime configuration.

On rerun, matching policies/users are updated without deleting buckets or objects.
A user with unrelated policies or group memberships is rejected rather than silently
retaining additional privileges. Policy names include a hash of bucket and prefix,
so two installations cannot overwrite each other's scoped policy documents.
For a deliberate scope change, detach the previous policy explicitly before
rerunning; the script does not guess which unrelated grants may be removed.

## Existing installations

Keep the current RustFS root values in the new root secret files. Generate NEW,
independent backend, worker and operations identities/secrets; do not just copy the
old root key into all new files. Quiesce writers and take a backup using the current
release first. Create the new secret files/resources, run `storage_provision` once,
then switch backend and worker to their respective new identities. Resume only after
positive upload/worker/read tests and negative IAM tests. Preserve old backup/restore
artifacts. No bucket data migration, deletion or volume reinitialization is needed.
Do not run `down -v` for an existing deployment. This source change does not rotate
credentials or alter existing running installations automatically.

Production Compose performs this bootstrap through its dependency graph. For an
explicit rerun use the same production Compose arguments and `run --rm
storage_provision`. The command has root credentials only in this one-off container.
`backup-compose.sh` and `restore-compose.sh` add
`docker-compose.storage.operations.yml` ONLY to their one-off backend commands;
normal start/stop/resume commands retain runtime credentials. The overlay loads
operations files, also for external S3. Archive CLI now validates only storage
configuration; an archive does not require auth, RabbitMQ or DB credentials.
Audit additionally uses its separately configured database client.

Kubernetes local RustFS components include a `storage-provision` Job and a private
network allowlist. Install all externally managed secrets listed in the cluster
secret contract first. Wait for Job completion before admitting application traffic.
For a rerun/secret or policy change, recreate the completed Job (not the StatefulSet
or PVC); Job pod templates are immutable. Secret reload alone does not rerun a
completed Job. The mirrored bootstrap script is checked against the canonical
script by a regression test. The suspended example
`k8s/examples/storage-operations-job.yaml` mounts only operations S3 credentials and
an encrypted backup PVC. Select the verified backend image, rendered (hashed) runtime ConfigMap name,
backup/restore mode and backup storage, quiesce application writers, and resume that Job explicitly. It
covers the storage archive only; retain the database backup/consistency procedure.

## External providers

Provision the same three independent scoped identities out of band using the
provider's IAM. Do not run the RustFS bootstrap against a provider with a different
admin API. Root credentials are absent from external Compose/Kubernetes profiles.
Use the generated policy statement above as a baseline, adapting provider ARN/role
syntax and account constraints. Verify Put/Get/Delete under the media prefix,
HeadBucket/ListBucket, archive roundtrip and denials for CreateBucket,
PutBucketPolicy, foreign bucket/prefix and administrative APIs. Runtime bucket
autocreation is disabled for every provider. No external account was accessed by
this implementation's tests.

## Reproducible isolated verification

Run `scripts/test-storage-iam.sh`. It refuses an existing project/volume named
`security-storage-iam`, starts RustFS1.0.5 with a new volume and random loopback port,
runs official RC provisioning twice, checks preservation of an existing object,
then executes AWS SDK positive/negative tests and a real archive/restore roundtrip
with the operations account. It also checks admin API denials through RC. Cleanup
removes only that disposable project's containers/network/volume. The fixture
credentials are public synthetic test values and must never be deployed.

Official references: [RustFS IAM](https://docs.rustfs.com/en/security-compliance/iam),
[official RC command reference](https://docs.rustfs.com/en/operations/rc).
