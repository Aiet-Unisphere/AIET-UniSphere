# AIET-UniSphere Code Studio — Security Hardening Specification

## 1. Security Architecture Principles

AIET-UniSphere Code Studio enforces defense-in-depth across the web tier, storage layer, and isolated container execution engine. The environment is engineered specifically to prevent:
- Execution of untrusted student code on the host application machine.
- Cross-student data tampering or unauthorized project access.
- Arbitrary command injection or shell escapes.
- Leaks of cloud environment secrets or server tokens.
- Malicious ZIP traversal attacks (Zip Slip).

---

## 2. Web & Gateway Security

### 2.1 Pre-Upgrade WebSocket Authentication
- **Vulnerability Mitigated:** Establishing unauthorized duplex WebSocket tunnels without token verification.
- **Implementation:** The execution HTTP server attaches directly to `server.on('upgrade')`. Incoming WebSocket connection requests must provide an authorized Supabase JWT Bearer token and valid `projectId` via HTTP query parameters (`/terminal?token=...&projectId=...`).
- **Enforcement:** The gateway cryptographically validates the JWT with the Supabase Auth API and verifies that the authenticated student owns or is a member of the requested project *prior* to completing the HTTP 101 Switching Protocols handshake.

### 2.2 Rate Limiting & Concurrency Controls
- **Rate Limit:** Sliding-window limiter restricts clients to a maximum of 60 requests per minute per IP address.
- **Concurrency Caps:**
  - Maximum 1 active execution session per project.
  - Maximum 2 concurrent execution sessions per user.
  - Global ceiling of 10 concurrent containers across the host daemon.

---

## 3. Sandboxed Container Isolation

### 3.1 Network Isolation (`--network none`)
All user execution containers are launched with the Docker flag `--network none`. Containers have zero access to the host loopback interface, external internet, or local cloud metadata services (e.g. `169.254.169.254`). Outbound socket connections immediately fail with network unreachable errors.

### 3.2 Resource & Quota Constraints
To prevent denial-of-service, infinite loops, and fork-bombs, each container is strictly bounded:
- **Memory Limit:** 256MB (`--memory=256m`)
- **Swap Limit:** 256MB (`--memory-swap=256m`, disabling swap memory abuse)
- **CPU Limit:** 50% of one core (`--cpus=0.5`)
- **Process Ceiling:** 64 processes (`--pids-limit=64`)
- **Execution Timeout:** 15 seconds enforced by process timer; sends `SIGKILL` if container fails to exit cleanly.

### 3.3 Safe Argument Array Execution (No Shell Interpolation)
- **Vulnerability Mitigated:** Shell command injection via filename or argument interpolation (e.g., `; rm -rf /` or `$(curl ...)`).
- **Implementation:** All container management tasks execute via `child_process.execFileSync` using explicit argument arrays:
  ```ts
  // VULNERABLE PATTERN (Eliminated)
  execSync(`docker run --name ${containerName} ...`);

  // HARDENED PATTERN (Enforced)
  execFileSync('docker', ['run', '--name', containerName, ...safeArgs]);
  ```
- File names, container names, and paths are strictly validated with regex (`/^[a-zA-Z0-9_\-./]+$/`).

### 3.4 Honest Infrastructure Availability
If Docker is not running or installed on the execution host, the system:
- **Never mocks code execution** or prints fake terminal responses.
- Explicitly flags Docker as unavailable with status `unavailable`.
- Notifies the student with actionable error messages indicating the container host status.

---

## 4. Path Traversal & Zip Slip Defense

### 4.1 Path Traversal Rejection
During folder creation, file creation, renaming, and import:
- Paths are canonicalized and sanitized (`sanitizeRelativePath`).
- Any entry containing traversal sequences (`..`), leading slashes, Windows drive letters (`C:`), or null bytes (`\0`) is rejected.
- When expanding imported directories or archives, target paths are verified to remain strictly within the designated project root:
  ```ts
  const resolved = path.resolve(destDir, relPath);
  if (!resolved.startsWith(path.resolve(destDir) + path.sep)) {
    throw new Error('Zip Slip traversal attempt blocked');
  }
  ```

---

## 5. HTML Sandboxing & Preview Gateway

For web projects containing HTML, CSS, and client-side JavaScript:
- Preview HTML is rendered in an isolated `<iframe>` configured with:
  ```html
  <iframe sandbox="allow-scripts" srcdoc="..." />
  ```
- **CSP Headers:** Served with strict Content Security Policy restricting connections to `self` and blocking external resource fetching.
- Scripts cannot access host cookies, parent DOM, `localStorage`, or authentication tokens.

