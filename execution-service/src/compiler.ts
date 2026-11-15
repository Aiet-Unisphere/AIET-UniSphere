/**
 * AIET-UniSphere — Multi-Language Compiler & Runner Definitions
 */

import path from 'node:path';
import { config } from './config.ts';
import { DockerManager } from './dockerManager.ts';
import type { ExecutionFile, ExecutionOutcome, SupportedLanguage } from './types.ts';

export interface CompilerPipeline {
  image: string;
  compileCommand?: string[];
  runCommand: (entryFile: string) => string[];
}

export const languagePipelines: Record<SupportedLanguage, CompilerPipeline> = {
  python: {
    image: config.dockerImages.python,
    runCommand: (entryFile: string) => ['python3', '-u', entryFile] // -u for unbuffered output
  },
  javascript: {
    image: config.dockerImages.javascript,
    runCommand: (entryFile: string) => ['node', entryFile]
  },
  java: {
    image: config.dockerImages.java,
    compileCommand: ['javac'],
    runCommand: (entryFile: string) => {
      const className = path.basename(entryFile, path.extname(entryFile));
      return ['java', className];
    }
  },
  c: {
    image: config.dockerImages.c,
    compileCommand: ['gcc', '-O2', '-Wall', '-o', 'unisphere_prog'],
    runCommand: () => ['./unisphere_prog']
  },
  cpp: {
    image: config.dockerImages.cpp,
    compileCommand: ['g++', '-O2', '-Wall', '-o', 'unisphere_prog'],
    runCommand: () => ['./unisphere_prog']
  }
};

export class LanguageRunner {
  private dockerManager: DockerManager;

  constructor(dockerManager: DockerManager) {
    this.dockerManager = dockerManager;
  }

  public async run(
    projectId: string,
    language: SupportedLanguage,
    entryFilePath: string,
    files: ExecutionFile[],
    stdin?: string
  ): Promise<ExecutionOutcome> {
    const pipeline = languagePipelines[language];
    if (!pipeline) {
      return {
        success: false,
        stdout: '',
        stderr: `Unsupported language: ${language}`,
        exitCode: 1,
        executionDurationMs: 0,
        timedOut: false,
        timestamp: new Date().toISOString()
      };
    }

    // 1. Prepare isolated workspace directory with student files
    this.dockerManager.prepareWorkspace(projectId, files);

    try {
      // 2. Compilation step (for Java, C, C++)
      if (pipeline.compileCommand) {
        const compileArgs = [...pipeline.compileCommand, entryFilePath];
        const compileRes = await this.dockerManager.executeInContainer(
          projectId,
          pipeline.image,
          compileArgs,
          undefined,
          5000 // 5s compilation timeout
        );

        if (!compileRes.success || compileRes.exitCode !== 0) {
          return {
            success: false,
            stdout: compileRes.stdout,
            stderr: compileRes.stderr,
            exitCode: compileRes.exitCode || 1,
            executionDurationMs: compileRes.executionDurationMs,
            timedOut: compileRes.timedOut,
            compilationError: compileRes.stderr || 'Compilation failed.',
            timestamp: new Date().toISOString()
          };
        }
      }

      // 3. Execution step
      const runArgs = pipeline.runCommand(entryFilePath);
      return await this.dockerManager.executeInContainer(
        projectId,
        pipeline.image,
        runArgs,
        stdin,
        config.executionTimeoutMs
      );
    } finally {
      // 4. Clean up workspace files when done
      this.dockerManager.cleanupWorkspace(projectId);
    }
  }
}
