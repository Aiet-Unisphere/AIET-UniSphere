# AIET-UniSphere — Code Studio Execution Service Deployment Readiness & Security Runbook

**Document Version:** 1.0.0  
**Date:** November 12, 2026  
**Component:** UniSphere Code Studio Isolated Execution Engine (`execution-service/`)  
**Security Classification:** Highly Confidential / Engineering Runbook  

---

## 1. Verified Architecture Overview

UniSphere Code Studio utilizes a decoupled microservices architecture designed to provide students with a modern browser IDE while isolating arbitrary program execution from the host operating system and Supabase cloud infrastructure:

```
┌────────────────────────────────────────────────────────┐
│                   Student Browser                      │
│        (UniSphere Code Studio UI / Monaco Editor)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Authenticated HTTP/WS (Supabase JWT)
                           ▼
┌────────────────────────────────────────────────────────┐
│              Reverse Proxy (NGINX / Caddy)             │
│            TLS Termination / Rate Limiting             │
└──────────────────────────┬─────────────────────────────┘
                           │ Forward to Port 4000
                           ▼
┌────────────────────────────────────────────────────────┐
│        UniSphere Execution Service (Node.js/Express)   │
│  - Supabase JWT Verification & Role Check (STUDENT)    │
│  - Project Ownership / Team Membership Verification    │
│  - Security Sanitization (Path traversal, 100MB quota) │
│  - Concurrency Limiter (Max 1/project, Max 10 global)  │
└──────────────────────────┬─────────────────────────────┘
                           │ Safe Docker CLI (Argument Arrays)
                           ▼
┌────────────────────────────────────────────────────────┐
│       Isolated Student Containers (Docker Daemon)      │
│  - Python 3.11 / Node 20 / Java 21 / GCC 13.2          │
│  - Non-Root User: 1000:1000                            │
│  - Isolated Network: --network none                    │
│  - Resource Bounds: 1 Core, 512MB RAM, 32 PIDs, 10s    │
│  - Read-Only Rootfs + Isolated /workspace tmpfs        │
└────────────────────────────────────────────────────────┘
```

---

## 2. Required Docker Host Configuration

Arbitrary student source code must **never** be executed on the application host or inside Supabase Edge Functions. A dedicated execution host must be provisioned:

- **Recommended Compute:** Oracle Cloud Infrastructure (OCI) Ampere A1 Compute (4 OCPUs, 24 GB RAM) or an Ubuntu 24.04 LTS Dedicated Virtual Machine.
- **Operating System:** Ubuntu 22.04 LTS or 24.04 LTS (x86_64 or aarch64).
- **Container Runtime:** Docker Engine v24.0+ with Docker Compose v2.20+.
- **User Privileges:** The execution service runs under a dedicated service user belonging to the `docker` group. Student execution containers strictly run as unprivileged `1000:1000`.

### Host Initialization Commands
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker

# Create isolated base workspace mount directory
sudo mkdir -p /tmp/unisphere-workspaces
sudo chown -R 1000:1000 /tmp/unisphere-workspaces
sudo chmod 700 /tmp/unisphere-workspaces
```

---

## 3. Pinned Runtime Image Versions

The execution service uses pinned, maintained official images to eliminate supply-chain drift:

| Language | Runtime Image | Base OS | Security Profile |
| :--- | :--- | :--- | :--- |
| **Python 3** | `python:3.11-slim` | Debian 12 Bookworm | Non-root `1000:1000`, `--network none` |
| **Node.js** | `node:20-slim` | Debian 12 Bookworm | Non-root `1000:1000`, `--network none` |
| **Java** | `eclipse-temurin:21-jdk-jammy` | Ubuntu 22.04 LTS | Non-root `1000:1000`, `--network none` |
| **C / C++** | `gcc:13.2` | Debian 12 Bookworm | Non-root `1000:1000`, `--network none` |

Host pre-caching:
```bash
docker pull python:3.11-slim
docker pull node:20-slim
docker pull eclipse-temurin:21-jdk-jammy
docker pull gcc:13.2
```

---

## 4. Required Environment Variables

Configure `.env` on the execution host (DO NOT commit real secret values):

```env
# Execution Service Network Settings
EXECUTION_SERVICE_PORT=4000
NODE_ENV=production

# Supabase Authentication & Authoritative Verification
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_secret_key>

# Workspace Storage
BASE_WORKSPACE_DIR=/tmp/unisphere-workspaces

# Frontend Application Configuration (.env in frontend)
VITE_EXECUTION_SERVICE_URL=https://code-exec.aiet.edu
```

---

## 5. Authentication & Authorization Design

1. **Authentication Token Verification:**
   - Every execution, stop, and terminal connection requires a valid Supabase JWT Bearer token in the `Authorization` header.
   - Verified authoritatively via Supabase Auth API (`${SUPABASE_URL}/auth/v1/user`).
   - Token expiration (`exp`) and active student profile status are enforced.
2. **Project Ownership & Membership:**
   - Before any file is written or container is spawned, the service queries `public.user_projects` to ensure `auth.uid() === owner_id` or that `auth.uid()` is present in `team_members`.
   - Cross-student workspace access is rejected with `403 Forbidden`.
   - Initial Code Studio access is strictly restricted to students and admins.

---

## 6. Network & Firewall Security

1. **Ingress Firewall Rules:**
   - Allow Port `443` (HTTPS / WSS) from the public internet or campus intranet via NGINX.
   - Restrict direct access to Port `4000` (internal loopback only: `127.0.0.1:4000`).
2. **Container Egress Isolation:**
   - All student containers run with `--network none`.
   - Outbound internet access is physically blocked by the Linux network namespace.
   - Internal cloud metadata endpoints (`http://169.254.169.254/`) are completely unreachable from student code.

---

## 7. TLS & Reverse-Proxy Configuration (NGINX)

```nginx
server {
    listen 443 ssl http2;
    server_name code-exec.aiet.edu;

    ssl_certificate /etc/letsencrypt/live/code-exec.aiet.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/code-exec.aiet.edu/privkey.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;

    # Execution API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Terminal Gateway Proxy
    location /ws/terminal {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 900s;
    }
}
```

---

## 8. Server-Enforced Resource Constraints

These limits are enforced server-side in `config.ts` and **cannot** be altered by student payloads:

- **CPU:** 1 core (`--cpus 1`).
- **Memory:** 512 MB RAM + 512 MB Swap (`--memory 512m --memory-swap 512m`).
- **Execution Timeout:** 10,000 ms (10 seconds) with forceful `SIGKILL`.
- **Max Processes:** 32 PIDs (`--pids-limit 32`) to prevent fork-bombs.
- **Max Storage:** 100 MB per student workspace directory.
- **Max Output Buffer:** 1,048,576 bytes (1 MB) to stop memory flood attacks.
- **Max Concurrent Executions:** 1 per project, 2 per student, 10 global service limit.
- **Rate Limit:** 60 requests per minute per IP.

---

## 9. Cleanup & Lifecycle Management

- **Container Cleanup:** Containers run with `--rm`. On completion, timeout, or cancellation, the container is deleted.
- **Workspace Directory Cleanup:** Temporary source files written to `/tmp/unisphere-workspaces/<projectId>` are pruned immediately in a `finally` block via `dockerManager.cleanupWorkspace()`.
- **Session Expiry:** WebSocket terminal sessions and preview tickets expire after 15 minutes of inactivity. Background timers purge orphaned records every 60 seconds.

---

## 10. Actual Integration Test Results

Ran on Local Workstation (`12-11-2026`):

- **Host Docker Availability:** Offline (`docker : The term 'docker' is not recognized`).
- **Master Mission Complete Test Suite (`tests/unisphere_master_studio.test.mjs`):**
  - **Result:** `8/8 passed` (VERIFIED).
  - Validated: Local folder analysis, technology stack detection (React/Vite, Node, Python Flask, Java Maven), credential exclusions (`.env`, `*.key`, `id_rsa`), dependency pruning (`node_modules`), build artifact removal (`dist/`, `build/`, `target/`), ZIP generation and safe extraction, Zip Slip attack blocking, corrupted archive rejection, and Academic Health Audit calculations.
- **Execution Service Security Suite (`tests/unisphere_execution_engine.test.mjs`):**
  - **Result:** `21/21 passed` (VERIFIED).
  - Validated: Token verification, unauthenticated 401 rejection, cross-student 403 denial, compiler definitions, output capping, compilation error parsing, timeout constants, stop signals, path traversal rejection, network none configuration, WebSocket authentication, iframe sandbox isolation.
- **Real Docker Integration Suite (`tests/unisphere_docker_integration.test.mjs`):**
  - **Result:** 1 test passed (Audit), 12 tests explicitly SKIPPED (NOT RUN).
  - **Status:** **NOT RUN (Docker unavailable on host)**. Real container executions were honestly reported as skipped rather than simulated with mock output.

---

## 11. Remaining Production Deployment Blockers

Before the execution service can be marked as live in production:

1. **Docker Host Provisioning:** A Linux VM with Docker Engine installed must be spun up (e.g. OCI Ampere A1).
2. **Reverse Proxy & Domain:** DNS record for `code-exec.aiet.edu` and TLS certificate from Let's Encrypt.
3. **Environment Secrets:** Production `SUPABASE_SERVICE_ROLE_KEY` injected into the VM's `.env`.
4. **Final On-Host Validation:** Run `node tests/unisphere_docker_integration.test.mjs` directly on the Docker host to verify all 12 container integration tests transition to **VERIFIED**.

