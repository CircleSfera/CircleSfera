# Container Image Provenance and Digest Pinning — CircleSfera

This document records the cryptographic immutability policies, exact image provenance, and controlled update procedures for all container base images and third-party infrastructure services in CircleSfera.

---

## 1. Security Rationale & Objectives

Floating container tags (such as `node:24-alpine`, `nginx:alpine`, or `redis:7-alpine`) are mutable pointers subject to upstream changes without notice. In production environments, relying on floating tags presents critical risks:
1. **Supply Chain Attacks**: A compromised upstream maintainer credential, repository hijack, or compromised registry mirror could inject malicious code into production deployments upon rebuild or redeployment.
2. **Silent Behavioral Drift**: Upstream patch releases may introduce unforeseen bugs, glibc/musl regressions, or altered default configurations that break running applications.
3. **Non-Reproducible Builds**: Two identical commits built days apart could produce different runtime artifacts if base image tags resolved to different underlying layers.

To eliminate these vulnerabilities, CircleSfera mandates **cryptographic digest pinning** using the format `<image>:<tag>@sha256:<digest>`:
- The human-readable `<tag>` documents the intended semantic version.
- The immutable `@sha256:<digest>` cryptographically pins the exact multi-architecture OCI image index, ensuring bit-for-bit build reproducibility across developer workstations, CI runners, and production servers.

---

## 2. Image Provenance Registry

Every container base image and third-party infrastructure service utilized in CircleSfera is tracked below:

| Component | Pinned Reference | Upstream Versions | Architectures | Locations |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js Runtime** | `node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81` | Node.js `24.21.0`<br>Alpine Linux `3.22` | `amd64`, `arm64/v8`, `s390x` | `circlesfera-backend/Dockerfile` (build & prod)<br>`circlesfera-frontend/Dockerfile` (build) |
| **Nginx Web Server** | `nginx:alpine@sha256:c8497b180665e631ec92a5091125bec5b214f0e2b99409e30653a125b37557da` | Nginx `1.31.6`<br>Alpine Linux `3.22` | `amd64`, `arm64`, `s390x` | `circlesfera-frontend/Dockerfile` (prod)<br>`docker-compose.prod.yml` (`nginx-proxy`)<br>`docker-compose.yml` (`proxy`) |
| **Redis Cache / Queue** | `redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf` | Redis `7.4.11`<br>Alpine Linux `3.22` | `amd64`, `arm64`, `s390x` | `docker-compose.prod.yml`<br>`docker-compose.yml`<br>`docker-compose.dev.yml`<br>CI workflows (`ci-quality.yml`, `pr.yml`, etc.) |
| **PostgreSQL + pgvector** | `pgvector/pgvector:pg16@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b` | PostgreSQL `16.15-1.pgdg12+2`<br>pgvector `0.8.0` | `amd64`, `arm64` | `docker-compose.prod.yml`<br>`docker-compose.yml`<br>`docker-compose.dev.yml`<br>`docker-compose.e2e.yml`<br>CI workflows |

---

## 3. Multi-Architecture Compatibility

All pinned SHA-256 digests in CircleSfera are **OCI Image Index / Manifest List** digests rather than single-architecture layer digests. This guarantees seamless compatibility across disparate compute environments:
- **Production VPS (OVH)**: Automatically pulls the `linux/amd64` variant.
- **CI Runners (GitHub Actions)**: Automatically pulls the `linux/amd64` variant.
- **Local Workstations (Apple Silicon macOS)**: Automatically pulls the `linux/arm64` variant natively without requiring slow QEMU emulation.

---

## 4. Controlled Image Update Procedure

Base image digests must never be updated automatically in production without explicit review. To update an image when upstream releases security patches:

1. **Query Multi-Arch Manifest Digest**:
   Fetch the new OCI manifest list digest from the registry:
   ```bash
   node -e '
   async function getDigest(image, tag) {
     const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/${image}:pull`;
     const tokenRes = await fetch(tokenUrl).then(r => r.json());
     const res = await fetch(`https://registry-1.docker.io/v2/library/${image}/manifests/${tag}`, {
       headers: {
         Authorization: `Bearer ${tokenRes.token}`,
         Accept: "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json"
       }
     });
     console.log(image, tag, "Digest:", res.headers.get("docker-content-digest"));
   }
   getDigest("node", "24-alpine");
   '
   ```
2. **Apply Pinned Digest**:
   Update the corresponding `Dockerfile` and `docker-compose.*.yml` files.
3. **Verify Integrity & Tests**:
   Run the static digest verification suite and all tests:
   ```bash
   npm run docker:verify-digests
   npm run check
   npm test
   ```
4. **Update Documentation**:
   Record the new upstream version and digest in the table above.
5. **Merge via Pull Request**:
   Submit via standard pull request with passing CI status checks and peer review.

---

## 5. Automated CI Verification

To prevent accidental introduction of floating tags or unpinned images, CircleSfera enforces static verification in `.github/workflows/ci-quality.yml`:

```bash
npm run docker:verify-digests
```

The linter inspects:
- Every `FROM` directive in `circlesfera-backend/Dockerfile` and `circlesfera-frontend/Dockerfile`.
- Every third-party service image in `docker-compose.prod.yml`, `docker-compose.yml`, `circlesfera-backend/docker-compose.dev.yml`, and `docker-compose.e2e.yml`.
- All service containers in GitHub Actions workflows (`ci-quality.yml`, `pr.yml`, `playwright-nightly.yml`).

Any image lacking an exact 64-character hexadecimal SHA-256 digest fails the build, preventing merge.
