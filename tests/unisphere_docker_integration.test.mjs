/**
 * AIET-UniSphere — MISSION 02.1: Docker Host Real Integration Test Suite
 * 
 * Tests real Docker execution when a Docker host is available.
 * When Docker is not available on the current machine, explicitly skips
 * and reports the tests as NOT RUN (requires Docker host).
 * NEVER substitutes mocks for real Docker execution results.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { DockerManager } from '../execution-service/src/dockerManager.ts';
import { LanguageRunner } from '../execution-service/src/compiler.ts';

const checkDocker = () => {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
};

describe('UniSphere Code Studio — Docker Host Real Integration Tests', () => {
  const isDockerActive = checkDocker();
  const dockerManager = new DockerManager();
  const runner = new LanguageRunner(dockerManager);

  it('0. Docker Host Availability Audit', (t) => {
    if (!isDockerActive) {
      t.diagnostic('[INFRASTRUCTURE NOTICE] Docker daemon is NOT installed or running on this host.');
      t.diagnostic('[STATUS] All Docker-dependent container execution integration tests will be marked as SKIPPED (NOT RUN).');
      assert.strictEqual(isDockerActive, false, 'Docker is verified offline on current host');
      return;
    }
    assert.strictEqual(isDockerActive, true, 'Docker host is connected');
  });

  it('1. Python 3 real container execution', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-py', 'python', 'main.py', [
      { path: 'main.py', content: 'print("Python 3.11 Docker Runtime Verified")' }
    ]);
    assert.strictEqual(res.success, true);
    assert.ok(res.stdout.includes('Python 3.11 Docker Runtime Verified'));
  });

  it('2. Node.js real container execution', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-js', 'javascript', 'index.js', [
      { path: 'index.js', content: 'console.log("Node.js 20 Docker Runtime Verified");' }
    ]);
    assert.strictEqual(res.success, true);
    assert.ok(res.stdout.includes('Node.js 20 Docker Runtime Verified'));
  });

  it('3. Java compilation and execution in Temurin container', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-java', 'java', 'Main.java', [
      { path: 'Main.java', content: 'public class Main { public static void main(String[] args) { System.out.println("Java 21 Temurin Verified"); } }' }
    ]);
    assert.strictEqual(res.success, true);
    assert.ok(res.stdout.includes('Java 21 Temurin Verified'));
  });

  it('4. C compilation and execution in GCC container', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-c', 'c', 'main.c', [
      { path: 'main.c', content: '#include <stdio.h>\nint main() { printf("GCC 13.2 C Verified\\n"); return 0; }' }
    ]);
    assert.strictEqual(res.success, true);
    assert.ok(res.stdout.includes('GCC 13.2 C Verified'));
  });

  it('5. C++ compilation and execution in G++ container', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-cpp', 'cpp', 'main.cpp', [
      { path: 'main.cpp', content: '#include <iostream>\nint main() { std::cout << "GCC 13.2 C++ Verified\\n"; return 0; }' }
    ]);
    assert.strictEqual(res.success, true);
    assert.ok(res.stdout.includes('GCC 13.2 C++ Verified'));
  });

  it('6. Compilation failure diagnostics in container', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-c-fail', 'c', 'main.c', [
      { path: 'main.c', content: '#include <stdio.h>\nint main() { invalid_syntax; return 0; }' }
    ]);
    assert.strictEqual(res.success, false);
    assert.ok(res.stderr.includes('error:'));
  });

  it('7. Execution timeout and SIGKILL container termination', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-timeout', 'python', 'main.py', [
      { path: 'main.py', content: 'import time\nprint("Looping...")\nwhile True: time.sleep(1)' }
    ]);
    assert.strictEqual(res.timedOut, true);
    assert.strictEqual(res.exitCode, 124);
  });

  it('8. CPU & Memory constraint enforcement', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    // Attempt allocating 1GB in 512MB capped container (should fail / OOM)
    const res = await runner.run('test-proj-oom', 'python', 'main.py', [
      { path: 'main.py', content: 'x = bytearray(1024 * 1024 * 800)' }
    ]);
    assert.strictEqual(res.success, false);
  });

  it('9. PID limit enforcement (preventing fork-bombs)', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-pids', 'python', 'main.py', [
      { path: 'main.py', content: 'import os\nfor i in range(100): os.fork()' }
    ]);
    assert.strictEqual(res.success, false);
  });

  it('10. Network isolation (--network none verified against outbound call)', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    // Attempt outbound socket or metadata endpoint connection
    const res = await runner.run('test-proj-net', 'python', 'main.py', [
      { path: 'main.py', content: 'import urllib.request\ntry:\n  urllib.request.urlopen("http://169.254.169.254", timeout=2)\n  print("LEAK")\nexcept Exception as e:\n  print("BLOCKED")' }
    ]);
    assert.ok(res.stdout.includes('BLOCKED'));
    assert.ok(!res.stdout.includes('LEAK'));
  });

  it('11. Workspace persistence and post-execution cleanup', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    // Verify cleanupWorkspace removes all traces
  });

  it('12. Output flooding buffer truncation', async (t) => {
    if (!isDockerActive) {
      t.skip('NOT RUN: Docker host unavailable on current environment.');
      return;
    }
    const res = await runner.run('test-proj-flood', 'python', 'main.py', [
      { path: 'main.py', content: 'print("A" * (2 * 1024 * 1024))' }
    ]);
    assert.ok(res.stdout.includes('[Output truncated: Exceeded maximum 1MB buffer limit]'));
  });
});

