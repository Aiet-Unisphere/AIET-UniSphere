/**
 * AIET-UniSphere — Docker Isolation Engine (Hardened)
 * 
 * Orchestrates isolated container execution adhering strictly to security policies:
 * - Non-root container user (1000:1000)
 * - Dropped capabilities (--cap-drop ALL)
 * - No new privileges (--security-opt no-new-privileges:true)
 * - Zero network access (--network none)
 * - CPU & Memory caps (--cpus 1 --memory 512m --memory-swap 512m)
 * - Process limit (--pids-limit 32)
 * - Read-only rootfs with isolated project workspace mount
 * - Strict timeout enforcement with SIGKILL cleanup
 * - Zero shell execution: All Docker CLI invocations use safe argument arrays
 */

import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import type { ExecutionFile, ExecutionOutcome } from './types.ts';
import { capOutputBuffer } from './security.ts';

export class DockerManager {
  private activeContainers: Map<string, { containerId: string; process: any }> = new Map();

  /**
   * Checks if Docker daemon is accessible on the current host.
   */
  public isDockerAvailable(): boolean {
    try {
      execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Builds the Docker CLI command line arguments with all security restrictions enforced.
   * Generates a tamper-proof container identifier.
   */
  public buildDockerArgs(
    projectId: string,
    hostWorkspaceDir: string,
    image: string,
    command: string[]
  ): { args: string[]; containerName: string } {
    const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32);
    const randomHex = crypto.randomBytes(4).toString('hex');
    const containerName = `unisphere-run-${safeProject}-${Date.now()}-${randomHex}`;

    const args = [
      'run',
      '--rm', // Auto cleanup container when exited
      '--name', containerName,
      // Security Constraints
      '--network', config.networkMode, // 'none'
      '--cpus', String(config.maxCpu), // 1 core
      '--memory', `${config.maxMemoryMb}m`, // 512m
      '--memory-swap', `${config.maxMemoryMb}m`, // Disable swap expansion
      '--pids-limit', String(config.maxProcesses), // 32
      '--user', config.containerUser, // 1000:1000 non-root
      '--security-opt', 'no-new-privileges:true', // Prevent setuid elevation
      '--cap-drop', 'ALL', // Drop all Linux capabilities
      '--read-only', // Read-only root filesystem
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m', // Isolated memory tmpfs
      // Mount isolated project workspace only
      '-v', `${path.resolve(hostWorkspaceDir)}:/workspace:rw`,
      '-w', '/workspace',
      image,
      ...command
    ];

    return { args, containerName };
  }

  /**
   * Prepares the isolated project workspace on the host with the submitted files.
   * Prevents directory traversal, absolute paths, and symlink-based host escape.
   */
  public prepareWorkspace(projectId: string, files: ExecutionFile[]): string {
    const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32);
    const workspaceDir = path.resolve(config.baseWorkspaceDir, safeProject);
    fs.mkdirSync(workspaceDir, { recursive: true });

    for (const file of files) {
      const targetPath = path.resolve(workspaceDir, file.path);
      
      // Ensure target path stays strictly inside workspace directory
      if (!targetPath.startsWith(workspaceDir + path.sep) && targetPath !== workspaceDir) {
        throw new Error(`Security violation: Path '${file.path}' attempts to write outside the workspace directory.`);
      }

      // Disallow symlinks
      if (fs.existsSync(targetPath)) {
        const stat = fs.lstatSync(targetPath);
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(targetPath);
        }
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, file.content, 'utf8');
    }

    return workspaceDir;
  }

  /**
   * Cleans up the temporary workspace directory.
   */
  public cleanupWorkspace(projectId: string): void {
    try {
      const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32);
      const workspaceDir = path.resolve(config.baseWorkspaceDir, safeProject);
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn(`[DockerManager] Failed to cleanup workspace ${projectId}:`, e);
    }
  }

  /**
   * Executes a command inside an isolated container with timeout and resource monitoring.
   */
  public async executeInContainer(
    projectId: string,
    image: string,
    command: string[],
    stdinData?: string,
    timeoutMs: number = config.executionTimeoutMs
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();
    const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32);
    const workspaceDir = path.resolve(config.baseWorkspaceDir, safeProject);

    if (!this.isDockerAvailable()) {
      return {
        success: false,
        stdout: '',
        stderr: 'Docker execution daemon is not available on this host. Isolated container execution requires an active Docker daemon.',
        exitCode: -1,
        executionDurationMs: 0,
        timedOut: false,
        error: 'DOCKER_UNAVAILABLE',
        timestamp: new Date().toISOString()
      };
    }

    const { args, containerName } = this.buildDockerArgs(projectId, workspaceDir, image, command);

    return new Promise<ExecutionOutcome>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn('docker', args);
      this.activeContainers.set(projectId, { containerId: containerName, process: child });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          // Forcefully kill the container via safe execFileSync (no shell interpolation)
          execFileSync('docker', ['kill', containerName], { stdio: 'ignore' });
        } catch {
          child.kill('SIGKILL');
        }
      }, timeoutMs);

      if (stdinData && child.stdin) {
        child.stdin.write(stdinData);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        if (Buffer.byteLength(stdout) > config.maxOutputBytes) {
          try {
            execFileSync('docker', ['kill', containerName], { stdio: 'ignore' });
          } catch {}
          child.kill('SIGKILL');
          stdout = capOutputBuffer(stdout, config.maxOutputBytes);
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        if (Buffer.byteLength(stderr) > config.maxOutputBytes) {
          try {
            execFileSync('docker', ['kill', containerName], { stdio: 'ignore' });
          } catch {}
          child.kill('SIGKILL');
          stderr = capOutputBuffer(stderr, config.maxOutputBytes);
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeContainers.delete(projectId);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            success: false,
            stdout: capOutputBuffer(stdout),
            stderr: `Execution timed out after ${timeoutMs / 1000} seconds.\n${stderr}`,
            exitCode: 124, // Standard timeout exit code
            executionDurationMs: duration,
            timedOut: true,
            timestamp: new Date().toISOString()
          });
        } else {
          resolve({
            success: code === 0,
            stdout: capOutputBuffer(stdout),
            stderr: capOutputBuffer(stderr),
            exitCode: code,
            executionDurationMs: duration,
            timedOut: false,
            timestamp: new Date().toISOString()
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeContainers.delete(projectId);
        resolve({
          success: false,
          stdout: '',
          stderr: `Failed to spawn container: ${err.message}`,
          exitCode: -1,
          executionDurationMs: Date.now() - startTime,
          timedOut: false,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Forcibly stops a running container session for a project.
   */
  public stopExecution(projectId: string): boolean {
    const active = this.activeContainers.get(projectId);
    if (!active) return false;

    try {
      execFileSync('docker', ['kill', active.containerId], { stdio: 'ignore' });
    } catch {
      active.process.kill('SIGKILL');
    }

    this.activeContainers.delete(projectId);
    return true;
  }
}
