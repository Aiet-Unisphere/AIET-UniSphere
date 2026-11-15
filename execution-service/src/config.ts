/**
 * AIET-UniSphere Isolated Execution Service — Configuration & Security Constants
 * 
 * Server-enforced limits. Students CANNOT override these parameters.
 */

export interface ExecutionConfig {
  port: number;
  maxCpu: number;
  maxMemoryMb: number;
  executionTimeoutMs: number;
  maxProcesses: number;
  maxWorkspaceStorageMb: number;
  maxOutputBytes: number;
  containerUser: string;
  networkMode: string;
  baseWorkspaceDir: string;
  sessionExpiryMs: number;
  dockerImages: {
    python: string;
    javascript: string;
    java: string;
    c: string;
    cpp: string;
  };
}

export const config: ExecutionConfig = {
  port: parseInt(process.env.EXECUTION_SERVICE_PORT || '4000', 10),
  // Server-side resource constraints
  maxCpu: 1, // 1 core max
  maxMemoryMb: 512, // 512 MB RAM
  executionTimeoutMs: 10000, // 10s default execution timeout
  maxProcesses: 32, // Prevent fork-bombs
  maxWorkspaceStorageMb: 100, // 100MB per student workspace
  maxOutputBytes: 1024 * 1024, // 1MB output buffer cap
  containerUser: '1000:1000', // Unprivileged non-root user
  networkMode: 'none', // Strictly isolated: no internet, LAN, or 169.254.169.254 metadata
  baseWorkspaceDir: process.env.BASE_WORKSPACE_DIR || '/tmp/unisphere-workspaces',
  sessionExpiryMs: 15 * 60 * 1000, // 15 minutes terminal session expiry
  // Pinned runtime images
  dockerImages: {
    python: 'python:3.11-slim',
    javascript: 'node:20-slim',
    java: 'eclipse-temurin:21-jdk-jammy',
    c: 'gcc:13.2',
    cpp: 'gcc:13.2',
  }
};

