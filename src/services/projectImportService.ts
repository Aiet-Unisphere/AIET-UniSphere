/**
 * AIET-UniSphere — Project Import & Analysis Engine
 * 
 * Supports Local Folder and ZIP Archive Import with automatic framework detection,
 * secret/artifact exclusion, and safe workspace population.
 */

import * as fflate from 'fflate';
import { supabase } from '../lib/supabase';
import { createProject } from './projectService';
import { detectLanguage, validatePathSafety } from './workspaceService';

export interface RawImportFile {
  path: string; // Relative path e.g. "src/components/Header.tsx"
  name: string;
  size: number;
  content: string; // Text content or base64
  isBinary?: boolean;
}

export interface ExcludedFileInfo {
  path: string;
  reason: 'dependency' | 'build-artifact' | 'secret-credential' | 'cache' | 'os-metadata' | 'size-limit';
  description: string;
}

export interface TechnologyDetection {
  language: string;
  framework: string;
  buildSystem: string;
  manifestFile?: string;
  entryPoint?: string;
  confidence: number;
}

export interface ImportAnalysisResult {
  projectName: string;
  validFiles: RawImportFile[];
  excludedFiles: ExcludedFileInfo[];
  totalSizeBytes: number;
  folderCount: number;
  technologies: TechnologyDetection;
  warnings: string[];
}

// Patterns of sensitive files and heavy build artifacts to exclude
const EXCLUDED_PATTERNS: Array<{ regex: RegExp; reason: ExcludedFileInfo['reason']; desc: string }> = [
  { regex: /(?:^|\/)\.env(?:$|\..+)/i, reason: 'secret-credential', desc: 'Environment variables / Secret keys' },
  { regex: /(?:^|\/)(?:id_rsa|id_ed25519|.*\.pem|.*\.key|.*\.pfx|.*\.pkcs12)$/i, reason: 'secret-credential', desc: 'Private encryption key / Certificate' },
  { regex: /(?:^|\/)node_modules\//i, reason: 'dependency', desc: 'Node.js dependency packages' },
  { regex: /(?:^|\/)\.git\//i, reason: 'cache', desc: 'Git internal repository data' },
  { regex: /(?:^|\/)(?:dist|build|out|\.next|\.nuxt|\.svelte-kit)\//i, reason: 'build-artifact', desc: 'Compiled production build artifact' },
  { regex: /(?:^|\/)(?:__pycache__|\.pytest_cache|\.mypy_cache)\//i, reason: 'cache', desc: 'Python compiler bytecode cache' },
  { regex: /(?:^|\/)target\/(?:classes|test-classes)\//i, reason: 'build-artifact', desc: 'Java build target directory' },
  { regex: /(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i, reason: 'os-metadata', desc: 'Operating system metadata file' },
  { regex: /(?:^|\/)\.idea\//i, reason: 'cache', desc: 'IDE local settings directory' },
];

/**
 * Normalizes relative path separators and removes leading slashes.
 */
export const sanitizeRelativePath = (rawPath: string): string => {
  return rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
};

/**
 * Checks whether a path matches any exclusion rule.
 */
export const checkExclusion = (filePath: string): ExcludedFileInfo | null => {
  const normalized = sanitizeRelativePath(filePath);
  for (const rule of EXCLUDED_PATTERNS) {
    if (rule.regex.test(normalized)) {
      return {
        path: normalized,
        reason: rule.reason,
        description: rule.desc
      };
    }
  }
  return null;
};

/**
 * Analyzes file contents and directory structure to detect project language,
 * framework, build manifests, and entry points.
 */
export const analyzeTechnologies = (files: RawImportFile[]): TechnologyDetection => {
  const fileNames = new Set(files.map(f => f.path.toLowerCase()));
  const fileContents = new Map(files.map(f => [f.path.toLowerCase(), f.content]));

  // 1. React / Vite / Next / Node.js
  if (fileNames.has('package.json')) {
    const pkgContent = fileContents.get('package.json') || '';
    let framework = 'Node.js';
    let buildSystem = 'npm';

    if (fileNames.has('vite.config.ts') || fileNames.has('vite.config.js') || pkgContent.includes('"vite"')) {
      framework = pkgContent.includes('"react"') ? 'React (Vite)' : 'Vite';
      buildSystem = 'vite';
    } else if (fileNames.has('next.config.js') || fileNames.has('next.config.mjs') || pkgContent.includes('"next"')) {
      framework = 'Next.js';
      buildSystem = 'next';
    } else if (pkgContent.includes('"react"')) {
      framework = 'React';
    } else if (pkgContent.includes('"express"') || pkgContent.includes('"fastify"')) {
      framework = 'Express.js Backend';
    }

    const hasTs = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
    const entry = files.find(f => /src\/(?:index|main|app)\.(?:tsx|ts|jsx|js)/i.test(f.path))?.path 
      || files.find(f => /(?:index|main|app)\.(?:tsx|ts|jsx|js)/i.test(f.path))?.path 
      || 'index.js';

    return {
      language: hasTs ? 'TypeScript' : 'JavaScript',
      framework,
      buildSystem,
      manifestFile: 'package.json',
      entryPoint: entry,
      confidence: 0.95
    };
  }

  // 2. Python (Django / Flask / FastAPI / Standard)
  if (fileNames.has('requirements.txt') || fileNames.has('pyproject.toml') || fileNames.has('setup.py') || files.some(f => f.path.endsWith('.py'))) {
    let framework = 'Python';
    if (fileNames.has('manage.py')) framework = 'Django';
    else if (files.some(f => f.content.includes('Flask(') || f.content.includes('import flask'))) framework = 'Flask';
    else if (files.some(f => f.content.includes('FastAPI(') || f.content.includes('from fastapi'))) framework = 'FastAPI';

    const entry = fileNames.has('main.py') ? 'main.py' : (fileNames.has('app.py') ? 'app.py' : (fileNames.has('manage.py') ? 'manage.py' : files.find(f => f.path.endsWith('.py'))?.path || 'main.py'));

    return {
      language: 'Python',
      framework,
      buildSystem: fileNames.has('pyproject.toml') ? 'poetry/flit' : 'pip',
      manifestFile: fileNames.has('requirements.txt') ? 'requirements.txt' : (fileNames.has('pyproject.toml') ? 'pyproject.toml' : undefined),
      entryPoint: entry,
      confidence: 0.9
    };
  }

  // 3. Java (Maven / Gradle / Standard)
  if (fileNames.has('pom.xml') || fileNames.has('build.gradle') || fileNames.has('build.gradle.kts') || files.some(f => f.path.endsWith('.java'))) {
    const buildSystem = fileNames.has('pom.xml') ? 'Maven' : (fileNames.has('build.gradle') ? 'Gradle' : 'javac');
    const mainJava = files.find(f => /public\s+static\s+void\s+main/i.test(f.content))?.path || files.find(f => f.path.endsWith('.java'))?.path || 'Main.java';

    return {
      language: 'Java',
      framework: fileNames.has('pom.xml') && fileContents.get('pom.xml')?.includes('spring-boot') ? 'Spring Boot' : 'Java Standard',
      buildSystem,
      manifestFile: fileNames.has('pom.xml') ? 'pom.xml' : (fileNames.has('build.gradle') ? 'build.gradle' : undefined),
      entryPoint: mainJava,
      confidence: 0.9
    };
  }

  // 4. C / C++
  if (fileNames.has('makefile') || fileNames.has('cmakelists.txt') || files.some(f => /\.(?:c|cpp|cc|cxx|h|hpp)$/i.test(f.path))) {
    const isCpp = files.some(f => /\.(?:cpp|cc|cxx|hpp)$/i.test(f.path));
    const entry = files.find(f => /int\s+main\s*\(/i.test(f.content))?.path || (isCpp ? 'main.cpp' : 'main.c');

    return {
      language: isCpp ? 'C++' : 'C',
      framework: fileNames.has('cmakelists.txt') ? 'CMake' : (fileNames.has('makefile') ? 'Makefile' : 'Native C/C++'),
      buildSystem: fileNames.has('cmakelists.txt') ? 'CMake' : (fileNames.has('makefile') ? 'Make' : 'gcc/g++'),
      manifestFile: fileNames.has('cmakelists.txt') ? 'CMakeLists.txt' : (fileNames.has('makefile') ? 'Makefile' : undefined),
      entryPoint: entry,
      confidence: 0.85
    };
  }

  // 5. HTML/CSS/JavaScript
  if (fileNames.has('index.html')) {
    return {
      language: 'HTML/CSS/JavaScript',
      framework: 'Static Web Application',
      buildSystem: 'Browser Native',
      entryPoint: 'index.html',
      confidence: 0.9
    };
  }

  // 6. Generic Fallback
  return {
    language: 'Polyglot / Generic',
    framework: 'General Project',
    buildSystem: 'Manual',
    entryPoint: files[0]?.path || 'README.md',
    confidence: 0.5
  };
};

/**
 * Inspects raw imported files, filters out excluded paths, performs validation,
 * and compiles comprehensive project intelligence.
 */
export const inspectAndAnalyzeImport = (
  rawFiles: Array<{ path: string; name: string; size: number; content: string }>,
  suggestedName?: string
): ImportAnalysisResult => {
  const validFiles: RawImportFile[] = [];
  const excludedFiles: ExcludedFileInfo[] = [];
  const warnings: string[] = [];
  let totalSizeBytes = 0;
  const folderSet = new Set<string>();

  // Determine base name from top-level folder if all files share a common root
  let inferredProjectName = suggestedName || 'Imported Project';
  const firstPath = rawFiles[0]?.path || '';
  if (firstPath.includes('/')) {
    const rootCandidate = firstPath.split('/')[0];
    const allShareRoot = rawFiles.every(f => f.path.startsWith(`${rootCandidate}/`));
    if (allShareRoot && rootCandidate.trim()) {
      inferredProjectName = rootCandidate;
    }
  }

  for (const item of rawFiles) {
    let cleanPath = sanitizeRelativePath(item.path);

    // If all files share a common root directory (e.g. "my-app/src/..."), strip the root container folder
    if (cleanPath.startsWith(`${inferredProjectName}/`)) {
      cleanPath = cleanPath.substring(inferredProjectName.length + 1);
    }

    if (!cleanPath) continue;

    // Check path traversal & illegal character safety
    const fileName = cleanPath.split('/').pop() || cleanPath;
    try {
      validatePathSafety(fileName, cleanPath);
    } catch (err: any) {
      excludedFiles.push({
        path: cleanPath,
        reason: 'size-limit',
        description: `Rejected for security: ${err.message || 'Illegal path'}`
      });
      continue;
    }

    // Check default exclusion rules (node_modules, .env, .git, etc.)
    const exclusion = checkExclusion(cleanPath);
    if (exclusion) {
      excludedFiles.push(exclusion);
      continue;
    }

    // Limit individual file size to 5MB
    if (item.size > 5 * 1024 * 1024) {
      excludedFiles.push({
        path: cleanPath,
        reason: 'size-limit',
        description: 'File size exceeds 5MB limit for Code Studio workspace'
      });
      continue;
    }

    totalSizeBytes += item.size;
    validFiles.push({
      path: cleanPath,
      name: item.name,
      size: item.size,
      content: item.content
    });

    // Track folder paths
    const parts = cleanPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join('/'));
    }
  }

  // Derive package name if package.json exists
  const pkgFile = validFiles.find(f => f.path === 'package.json');
  if (pkgFile) {
    try {
      const parsed = JSON.parse(pkgFile.content);
      if (parsed.name && typeof parsed.name === 'string') {
        inferredProjectName = parsed.name.replace(/[^a-zA-Z0-9_-]/g, ' ').trim();
      }
    } catch {}
  }

  if (validFiles.length === 0) {
    warnings.push('No valid importable source files were found in the selected location.');
  }

  if (excludedFiles.some(f => f.reason === 'secret-credential')) {
    warnings.push('Protected secrets (e.g. .env, private keys) were automatically excluded to prevent credential leaks.');
  }

  if (!validFiles.some(f => /^readme(?:\.md|\.txt)?$/i.test(f.path))) {
    warnings.push('No README file detected. UniSphere can generate project documentation for you.');
  }

  const technologies = analyzeTechnologies(validFiles);

  return {
    projectName: inferredProjectName.charAt(0).toUpperCase() + inferredProjectName.slice(1),
    validFiles,
    excludedFiles,
    totalSizeBytes,
    folderCount: folderSet.size,
    technologies,
    warnings
  };
};

/**
 * Safely extracts a ZIP archive into a structured list of files,
 * rejecting archive path traversal (Zip Slip), corrupted archives, and zip bombs.
 */
export const extractZipArchive = async (fileBuffer: Uint8Array): Promise<RawImportFile[]> => {
  return new Promise((resolve, reject) => {
    try {
      fflate.unzip(fileBuffer, (err, unzipped) => {
        if (err) {
          return reject(new Error(`Failed to extract ZIP archive: ${err.message}`));
        }

        const files: RawImportFile[] = [];
        let totalUncompressedSize = 0;
        const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB max extracted

        for (const [entryPath, data] of Object.entries(unzipped)) {
          // Skip directory markers
          if (entryPath.endsWith('/')) continue;

          const cleanPath = sanitizeRelativePath(entryPath);

          // Path Traversal (Zip Slip) Protection
          if (cleanPath.includes('..') || cleanPath.startsWith('/') || cleanPath.includes('\0')) {
            continue; // Skip dangerous entries
          }

          totalUncompressedSize += data.length;
          if (totalUncompressedSize > MAX_TOTAL_SIZE) {
            return reject(new Error('ZIP extraction aborted: Archive exceeds 100MB total extracted size limit.'));
          }

          // Decode text or binary
          let content = '';
          try {
            content = fflate.strFromU8(data);
          } catch {
            // Binary fallback (skip or store placeholder)
            content = '[Binary File]';
          }

          files.push({
            path: cleanPath,
            name: cleanPath.split('/').pop() || cleanPath,
            size: data.length,
            content
          });
        }

        resolve(files);
      });
    } catch (err: any) {
      reject(new Error(`ZIP archive extraction error: ${err.message}`));
    }
  });
};

/**
 * Persists an analyzed project into `user_projects` and recursively inserts its
 * directories and files into `project_files`, establishing the full file tree hierarchy.
 */
export const commitImportedProjectWorkspace = async (
  analysis: ImportAnalysisResult,
  customProjectName?: string,
  customDescription?: string
): Promise<{ projectId: string; totalFilesSaved: number }> => {
  const sb = supabase as any;
  const projectName = customProjectName || analysis.projectName;
  const description = customDescription || `Imported ${analysis.technologies.framework} project (${analysis.technologies.language})`;

  // 1. Create User Project Record
  const techStack = [analysis.technologies.language, analysis.technologies.framework].filter(Boolean);
  const newProject = await createProject({
    name: projectName,
    description,
    technology: techStack,
    projectType: 'Personal',
  });

  const projectId = newProject.id;

  // 2. Build Folder Nodes Hierarchy
  const folderIdMap = new Map<string, string>(); // "src" -> folder UUID, "src/components" -> UUID
  const foldersToCreate = new Set<string>();

  for (const file of analysis.validFiles) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      foldersToCreate.add(parts.slice(0, i).join('/'));
    }
  }

  // Sort folders by depth so parents are created first
  const sortedFolders = Array.from(foldersToCreate).sort((a, b) => a.split('/').length - b.split('/').length);

  for (const folderPath of sortedFolders) {
    const parts = folderPath.split('/');
    const folderName = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parentId = parentPath ? folderIdMap.get(parentPath) || null : null;

    const { data: createdFolder, error: folderErr } = await sb
      .from('project_files')
      .insert({
        project_id: projectId,
        parent_id: parentId,
        name: folderName,
        type: 'folder',
        path: folderPath,
        content: null,
        language: null,
      })
      .select('id')
      .single();

    if (!folderErr && createdFolder) {
      folderIdMap.set(folderPath, createdFolder.id);
    }
  }

  // 3. Batch Insert Files
  const fileRows = analysis.validFiles.map(f => {
    const parts = f.path.split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const parentId = parentPath ? folderIdMap.get(parentPath) || null : null;
    const lang = detectLanguage(f.name);

    return {
      project_id: projectId,
      parent_id: parentId,
      name: f.name,
      type: 'file',
      path: f.path,
      content: f.content,
      language: lang,
    };
  });

  // Insert in batches of 50 to avoid request size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < fileRows.length; i += BATCH_SIZE) {
    const batch = fileRows.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await sb.from('project_files').insert(batch);
    if (insertErr) {
      console.error('[projectImportService] Error inserting file batch:', insertErr.message);
    }
  }

  return {
    projectId,
    totalFilesSaved: analysis.validFiles.length
  };
};

/**
 * Options for exporting a project archive as a ZIP file.
 */
export interface ProjectExportOptions {
  includeManifest?: boolean;
  submissionMetadata?: {
    studentName?: string;
    studentId?: string;
    courseName?: string;
    academicYear?: string;
    notes?: string;
  };
}

/**
 * Generates an in-memory ZIP archive from project files.
 * Automatically excludes secrets (.env, keys) and heavy build artifacts.
 */
export const generateProjectZip = (
  projectName: string,
  files: Array<{ path: string; content: string }>,
  options?: ProjectExportOptions
): Uint8Array => {
  const zipData: Record<string, Uint8Array> = {};

  const cleanFiles: Array<{ path: string; size: number }> = [];

  for (const file of files) {
    if (!file.path) continue;
    const sanitized = sanitizeRelativePath(file.path);
    if (!sanitized) continue;

    // Filter out forbidden paths & secrets
    if (checkExclusion(sanitized)) continue;

    const u8 = fflate.strToU8(file.content || '');
    zipData[sanitized] = u8;
    cleanFiles.push({ path: sanitized, size: u8.length });
  }

  // Generate standardized Academic Submission Manifest if requested
  if (options?.includeManifest) {
    const manifest = {
      project_name: projectName,
      system: 'AIET-UniSphere Academic Code Studio',
      format_version: '1.0.0',
      exported_at: new Date().toISOString(),
      student: options.submissionMetadata || null,
      file_count: cleanFiles.length,
      manifest: cleanFiles,
      academic_declaration: 'I hereby declare that this project submission represents my original academic work developed under AIET-UniSphere.'
    };
    zipData['submission-manifest.json'] = fflate.strToU8(JSON.stringify(manifest, null, 2));
  }

  return fflate.zipSync(zipData);
};

/**
 * Triggers a browser download of the generated ZIP package.
 */
export const downloadProjectZip = (
  projectName: string,
  files: Array<{ path: string; content: string }>,
  options?: ProjectExportOptions
): void => {
  const zipBytes = generateProjectZip(projectName, files, options);
  const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  anchor.href = url;
  anchor.download = `${safeName}-submission.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

