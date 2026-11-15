import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Archive,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  Download,
  Save,
  HelpCircle,
  Code2,
  FileText,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Award
} from 'lucide-react';
import type { FileTreeNode } from './WorkspaceFileExplorer';
import { analyzeTechnologies, type RawImportFile, downloadProjectZip } from '../services/projectImportService';

interface WorkspaceAcademicPanelsProps {
  panelType: 'intelligence' | 'health' | 'assistant' | 'docs' | 'submission' | 'team';
  projectName: string;
  projectDescription?: string;
  projectType?: string;
  files: FileTreeNode[];
  editorTheme: 'vs-dark' | 'light';
  onSaveFile?: (path: string, content: string) => Promise<void>;
  onNavigateToFile?: (path: string) => void;
  onOpenDocsStudio?: () => void;
}

// Flatten tree to a flat list of files with relative paths and content
const flattenFilesForAnalysis = (nodes: FileTreeNode[], prefix = ''): Array<{ path: string; name: string; content: string; size: number }> => {
  let list: Array<{ path: string; name: string; content: string; size: number }> = [];
  for (const node of nodes) {
    const curPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      const content = node.content || '';
      list.push({
        path: curPath,
        name: node.name,
        content,
        size: content.length,
      });
    } else if (node.type === 'folder' && node.children) {
      list = list.concat(flattenFilesForAnalysis(node.children, curPath));
    }
  }
  return list;
};

export const WorkspaceAcademicPanels: React.FC<WorkspaceAcademicPanelsProps> = ({
  panelType,
  projectName,
  projectDescription = '',
  projectType = 'Academic Project',
  files,
  editorTheme,
  onSaveFile,
  onNavigateToFile,
  onOpenDocsStudio
}) => {
  const isDark = editorTheme === 'vs-dark';

  // Flat file list
  const flatFiles = useMemo(() => flattenFilesForAnalysis(files), [files]);

  // Technology analysis
  const techAnalysis = useMemo(() => {
    const rawFiles: RawImportFile[] = flatFiles.map(f => ({
      path: f.path,
      name: f.name,
      content: f.content,
      size: f.size
    }));
    return analyzeTechnologies(rawFiles);
  }, [flatFiles]);

  // File extension statistics
  const extStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of flatFiles) {
      const ext = f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() || 'other' : 'no-ext';
      counts[ext] = (counts[ext] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [flatFiles]);

  // Total lines of code
  const totalLines = useMemo(() => {
    return flatFiles.reduce((acc, f) => acc + (f.content ? f.content.split('\n').length : 0), 0);
  }, [flatFiles]);

  // Health Audit Calculations
  const healthAudit = useMemo(() => {
    const hasReadme = flatFiles.some(f => /^readme(?:\.md|\.txt)?$/i.test(f.name));
    const hasHonorCode = flatFiles.some(f => /honor|declaration|academic/i.test(f.name) || (f.content && /academic integrity|declaration/i.test(f.content)));
    const hasEntryPoint = !!techAnalysis.entryPoint || flatFiles.some(f => /(?:index|main|app)\.(?:tsx?|jsx?|py|java|c|cpp|html)$/i.test(f.name));
    const hasManifest = !!techAnalysis.manifestFile || flatFiles.some(f => /(?:package\.json|requirements\.txt|pom\.xml|CMakeLists\.txt)$/i.test(f.name));
    const hasTests = flatFiles.some(f => /(?:test|spec)\./i.test(f.name) || f.path.startsWith('tests/'));
    const hasExposedSecret = flatFiles.some(f => /(?:^\.env|secret|id_rsa)/i.test(f.name));

    let score = 0;
    if (hasReadme) score += 25;
    if (hasEntryPoint) score += 25;
    if (hasManifest) score += 20;
    if (hasTests) score += 15;
    if (hasHonorCode) score += 15;
    if (hasExposedSecret) score -= 30;

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      hasReadme,
      hasHonorCode,
      hasEntryPoint,
      hasManifest,
      hasTests,
      hasExposedSecret
    };
  }, [flatFiles, techAnalysis]);

  // State for Documentation Studio
  const [docTitle, setDocTitle] = useState(projectName);
  const [docAuthor, setDocAuthor] = useState('AIET Engineering Student');
  const [docAbstract, setDocAbstract] = useState(projectDescription || 'An academic software development project developed at AIET.');
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [docSaveSuccess, setDocSaveSuccess] = useState(false);

  // State for Submission Form
  const [studentName, setStudentName] = useState('');
  const [studentUsn, setStudentUsn] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [semester, setSemester] = useState('6th Semester');
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // State for Viva Assistant
  const [expandedVivaIndex, setExpandedVivaIndex] = useState<number | null>(0);

  // Viva Questions based on detected technology
  const vivaQuestions = useMemo(() => {
    const list: Array<{ q: string; a: string; topic: string }> = [];

    if (techAnalysis.framework.includes('React') || techAnalysis.language === 'TypeScript' || techAnalysis.language === 'JavaScript') {
      list.push(
        {
          q: 'Explain the Virtual DOM and reconciliation mechanism in this project.',
          a: 'React keeps a lightweight virtual representation of the real DOM in memory. When state changes, a diffing algorithm determines minimal DOM mutations required, boosting performance.',
          topic: 'Frontend Architecture'
        },
        {
          q: 'How is state managed across components in your architecture?',
          a: 'Local component state is handled using React Hooks (useState, useReducer), while shared state is propagated via Props, Context, or state containers with unidirectional data flow.',
          topic: 'State Management'
        },
        {
          q: 'What build tools are utilized for bundling and asset optimization?',
          a: `This project utilizes ${techAnalysis.buildSystem || 'modern bundlers'} to compile TypeScript/JSX, perform tree shaking, code splitting, and optimize bundle size for distribution.`,
          topic: 'Build & Tooling'
        }
      );
    } else if (techAnalysis.language === 'Python') {
      list.push(
        {
          q: 'How does Python manage memory and garbage collection in this application?',
          a: 'Python uses reference counting as its primary garbage collection mechanism along with a cyclic garbage collector to detect and resolve circular references.',
          topic: 'Memory & Runtime'
        },
        {
          q: 'Explain the role of virtual environments and dependency specifications.',
          a: 'Virtual environments isolate project-specific dependencies from the global Python interpreter, ensuring reproducible builds specified in requirements.txt or pyproject.toml.',
          topic: 'Dependencies'
        },
        {
          q: 'What design pattern structures the execution flow of your modules?',
          a: 'The project modularizes functions and classes with a single responsibility principle, separating input processing, computational logic, and persistence layers.',
          topic: 'Design Patterns'
        }
      );
    } else if (techAnalysis.language === 'Java') {
      list.push(
        {
          q: 'How does the JVM handle class loading and byte-code execution?',
          a: 'The JVM ClassLoader dynamically loads compiled .class files into runtime data areas (Method Area, Heap, JVM Stacks), executing via JIT compiler and interpretation.',
          topic: 'JVM Architecture'
        },
        {
          q: 'Explain Object-Oriented principles applied in your project design.',
          a: 'Encapsulation secures internal class state, inheritance/polymorphism allows extensible interface contracts, and abstraction hides complex subsystem implementations.',
          topic: 'OOP Principles'
        }
      );
    } else {
      list.push(
        {
          q: 'What is the algorithmic complexity of your project’s primary routines?',
          a: 'The core algorithms run in linear O(N) or logarithmic O(log N) time relative to the input dataset size, maintaining sub-second execution in memory.',
          topic: 'Complexity'
        },
        {
          q: 'How does your project handle errors and abnormal termination?',
          a: 'Defensive programming safeguards inputs with boundary validation and structured exception handling to provide clean diagnostic recovery.',
          topic: 'Fault Tolerance'
        }
      );
    }

    list.push({
      q: 'What academic contributions or novel solutions does this project demonstrate?',
      a: `${projectName} solves academic workflow challenges by providing a modular, maintainable implementation of ${techAnalysis.framework || techAnalysis.language} with structured modularity.`,
      topic: 'Project Significance'
    });

    return list;
  }, [techAnalysis, projectName]);

  // Generated Markdown for Documentation Studio
  const generatedReadme = useMemo(() => {
    return `# ${docTitle}

> **Academic Project — AIET UniSphere Code Studio**  
> **Author:** ${docAuthor}  
> **Technology Stack:** ${techAnalysis.language} • ${techAnalysis.framework} • ${techAnalysis.buildSystem}

---

## 1. Project Abstract & Objectives

${docAbstract}

### Key Objectives
- Design and develop a robust, modular software system adhering to engineering best practices.
- Implement efficient algorithms and maintain clean separation of concerns.
- Ensure verifiable academic standards with complete documentation and reproducibility.

---

## 2. System Architecture & Tech Stack

- **Primary Language:** \`${techAnalysis.language}\`
- **Framework / Runtime:** \`${techAnalysis.framework}\`
- **Build System:** \`${techAnalysis.buildSystem}\`
- **Entry Point:** \`${techAnalysis.entryPoint || 'index or main file'}\`
- **Total Source Files:** ${flatFiles.length} files (${totalLines.toLocaleString()} lines of code)

---

## 3. Directory Structure

\`\`\`
${flatFiles.slice(0, 15).map(f => `├── ${f.path}`).join('\n')}${flatFiles.length > 15 ? '\n└── ...' : ''}
\`\`\`

---

## 4. Setup & Execution Instructions

1. Clone or download the UniSphere Code Studio project workspace.
2. Ensure prerequisites for \`${techAnalysis.language}\` are available.
3. Launch execution directly from UniSphere Code Studio using the **Run** button.

---

## 5. Academic Declaration

I hereby declare that this project titled **"${docTitle}"** is an authentic record of academic work carried out under the AIET academic curriculum. All external libraries, references, and frameworks utilized have been duly credited.
`;
  }, [docTitle, docAuthor, docAbstract, techAnalysis, flatFiles, totalLines]);

  const handleSaveReadme = async () => {
    if (!onSaveFile) return;
    setIsSavingDoc(true);
    setDocSaveSuccess(false);
    try {
      await onSaveFile('README.md', generatedReadme);
      setDocSaveSuccess(true);
      setTimeout(() => setDocSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to save README:', err);
    } finally {
      setIsSavingDoc(false);
    }
  };

  const handleExportSubmission = () => {
    downloadProjectZip(projectName, flatFiles, {
      includeManifest: true,
      submissionMetadata: {
        studentName: studentName || 'AIET Student',
        studentId: studentUsn || 'AIET-STUDENT-USN',
        courseName: department,
        academicYear: `2026 — ${semester}`,
        notes: `UniSphere Code Studio Academic Submission package containing ${flatFiles.length} files.`
      }
    });
    setSubmissionSuccess(true);
    setTimeout(() => setSubmissionSuccess(false), 5000);
  };

  const bgPanel = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#94A3B8' : '#64748B';
  const borderCol = isDark ? '#334155' : '#E2E8F0';
  const cardBg = isDark ? '#0F172A' : '#F8FAFC';

  return (
    <div
      className="workspace-academic-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgPanel,
        color: textPrimary,
        overflowY: 'auto',
        fontSize: '0.85rem'
      }}
    >
      {/* 1. PROJECT INTELLIGENCE */}
      {panelType === 'intelligence' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Sparkles size={18} style={{ color: '#38BDF8' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Project Intelligence
            </h3>
          </div>

          {/* Technology Badges */}
          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}`, marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Detected Architecture & Stack
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#38BDF8', color: '#0F172A', fontWeight: 700, fontSize: '0.75rem' }}>
                {techAnalysis.framework}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: '#3B82F6', color: '#FFFFFF', fontWeight: 600, fontSize: '0.75rem' }}>
                {techAnalysis.language}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: isDark ? '#334155' : '#E2E8F0', color: textPrimary, fontWeight: 600, fontSize: '0.75rem' }}>
                {techAnalysis.buildSystem}
              </span>
            </div>

            {techAnalysis.entryPoint && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: textMuted }}>
                <strong>Entry Point:</strong>{' '}
                <span
                  style={{ color: '#38BDF8', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => onNavigateToFile?.(techAnalysis.entryPoint!)}
                >
                  {techAnalysis.entryPoint}
                </span>
              </div>
            )}
          </div>

          {/* Workspace Statistics */}
          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}`, marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Workspace Metrics
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <div style={{ padding: '0.5rem', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '6px', border: `1px solid ${borderCol}` }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38BDF8' }}>{flatFiles.length}</div>
                <div style={{ fontSize: '0.7rem', color: textMuted }}>Source Files</div>
              </div>
              <div style={{ padding: '0.5rem', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '6px', border: `1px solid ${borderCol}` }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10B981' }}>{totalLines.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: textMuted }}>Lines of Code</div>
              </div>
            </div>
          </div>

          {/* Language Breakdown */}
          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}` }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              File Types Distribution
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {extStats.slice(0, 6).map(([ext, count]) => (
                <div key={ext} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                  <span style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}>.{ext}</span>
                  <span style={{ fontWeight: 700, color: textMuted }}>{count} file{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. PROJECT HEALTH & AUDIT */}
      {panelType === 'health' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <ShieldCheck size={18} style={{ color: healthAudit.score >= 80 ? '#10B981' : healthAudit.score >= 50 ? '#F59E0B' : '#EF4444' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Project Health & Audit
            </h3>
          </div>

          {/* Health Score Card */}
          <div style={{ backgroundColor: cardBg, padding: '1rem', borderRadius: '8px', border: `1px solid ${borderCol}`, textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: healthAudit.score >= 80 ? '#10B981' : healthAudit.score >= 50 ? '#F59E0B' : '#EF4444' }}>
              {healthAudit.score}%
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '0.2rem' }}>
              {healthAudit.score >= 80 ? 'Academic Ready (Excellent)' : healthAudit.score >= 50 ? 'Good Progress (Items Pending)' : 'Needs Attention'}
            </div>
            {/* Visual Bar */}
            <div style={{ height: '6px', width: '100%', backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: '3px', marginTop: '0.75rem', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${healthAudit.score}%`,
                  backgroundColor: healthAudit.score >= 80 ? '#10B981' : healthAudit.score >= 50 ? '#F59E0B' : '#EF4444',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          </div>

          {/* Audit Checklist */}
          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}`, marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
              Audit Criteria
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem' }}>Project Documentation (README.md)</span>
                {healthAudit.hasReadme ? (
                  <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                ) : (
                  <XCircle size={16} style={{ color: '#EF4444' }} />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem' }}>Identified Entry Point</span>
                {healthAudit.hasEntryPoint ? (
                  <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem' }}>Build / Package Manifest</span>
                {healthAudit.hasManifest ? (
                  <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem' }}>Academic Integrity Declaration</span>
                {healthAudit.hasHonorCode ? (
                  <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                ) : (
                  <XCircle size={16} style={{ color: '#EF4444' }} />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem' }}>Secret Security (No Leaked .env)</span>
                {!healthAudit.hasExposedSecret ? (
                  <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                ) : (
                  <XCircle size={16} style={{ color: '#EF4444' }} />
                )}
              </div>
            </div>
          </div>

          {!healthAudit.hasReadme && (
            <button
              onClick={onOpenDocsStudio}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#38BDF8',
                color: '#0F172A',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem'
              }}
            >
              <BookOpen size={14} />
              <span>Generate Academic README in Studio</span>
            </button>
          )}
        </div>
      )}

      {/* 3. ACADEMIC ASSISTANT & VIVA PREP */}
      {panelType === 'assistant' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <GraduationCap size={18} style={{ color: '#A855F7' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Viva Voce & Defense Prep
            </h3>
          </div>

          <p style={{ fontSize: '0.775rem', color: textMuted, margin: '0 0 1rem' }}>
            Tailored defense questions and talking points generated for <strong>{techAnalysis.framework || techAnalysis.language}</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {vivaQuestions.map((q, idx) => {
              const isExpanded = expandedVivaIndex === idx;
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: cardBg,
                    border: `1px solid ${borderCol}`,
                    borderRadius: '6px',
                    overflow: 'hidden'
                  }}
                >
                  <button
                    onClick={() => setExpandedVivaIndex(isExpanded ? null : idx)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'none',
                      border: 'none',
                      color: textPrimary,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '3px', backgroundColor: isDark ? '#334155' : '#E2E8F0', color: textMuted, fontWeight: 700, marginRight: '0.4rem' }}>
                        {q.topic}
                      </span>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '0.35rem' }}>
                        Q{idx + 1}: {q.q}
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '0.75rem', borderTop: `1px solid ${borderCol}`, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', fontSize: '0.775rem', lineHeight: 1.5, color: textMuted }}>
                      <strong style={{ color: '#10B981', display: 'block', marginBottom: '0.25rem' }}>Recommended Academic Defense:</strong>
                      {q.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. DOCUMENTATION STUDIO */}
      {panelType === 'docs' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <BookOpen size={18} style={{ color: '#38BDF8' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Documentation Studio
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Project Title
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${borderCol}`,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  color: textPrimary,
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Author / Lead Student
              </label>
              <input
                type="text"
                value={docAuthor}
                onChange={e => setDocAuthor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${borderCol}`,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  color: textPrimary,
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Abstract & Problem Statement
              </label>
              <textarea
                rows={3}
                value={docAbstract}
                onChange={e => setDocAbstract(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${borderCol}`,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  color: textPrimary,
                  fontSize: '0.8rem',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={handleSaveReadme}
              disabled={isSavingDoc}
              style={{
                flex: 1,
                padding: '0.5rem',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontWeight: 700,
                border: 'none',
                borderRadius: '6px',
                cursor: isSavingDoc ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem'
              }}
            >
              <Save size={14} />
              <span>{isSavingDoc ? 'Saving...' : 'Save to README.md'}</span>
            </button>
          </div>

          {docSaveSuccess && (
            <div style={{ padding: '0.5rem', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontSize: '0.775rem', marginBottom: '1rem' }}>
              ✓ Successfully created / updated README.md in workspace!
            </div>
          )}

          {/* Live Preview Box */}
          <div style={{ backgroundColor: cardBg, padding: '0.75rem', borderRadius: '6px', border: `1px solid ${borderCol}` }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Generated Preview
            </span>
            <pre style={{ margin: 0, fontSize: '0.7rem', maxHeight: '180px', overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: textMuted }}>
              {generatedReadme}
            </pre>
          </div>
        </div>
      )}

      {/* 5. ACADEMIC SUBMISSION MODE */}
      {panelType === 'submission' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Archive size={18} style={{ color: '#F59E0B' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Academic Submission Mode
            </h3>
          </div>

          <p style={{ fontSize: '0.775rem', color: textMuted, margin: '0 0 1rem' }}>
            Prepares a clean, standardized archive with a verifiable <code>submission-manifest.json</code> and excludes all local build caches and sensitive keys.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                Student Name
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${borderCol}`,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  color: textPrimary,
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                USN / University ID
              </label>
              <input
                type="text"
                placeholder="e.g. 4AL21CS001"
                value={studentUsn}
                onChange={e => setStudentUsn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  border: `1px solid ${borderCol}`,
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  color: textPrimary,
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                  Semester
                </label>
                <input
                  type="text"
                  value={semester}
                  onChange={e => setSemester(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    border: `1px solid ${borderCol}`,
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    color: textPrimary,
                    fontSize: '0.8rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    border: `1px solid ${borderCol}`,
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    color: textPrimary,
                    fontSize: '0.8rem'
                  }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleExportSubmission}
            style={{
              width: '100%',
              padding: '0.65rem',
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              fontWeight: 800,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Download size={15} />
            <span>Export Academic Submission ZIP</span>
          </button>

          {submissionSuccess && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem', backgroundColor: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontSize: '0.775rem' }}>
              ✓ Submission archive generated & downloaded successfully!
            </div>
          )}
        </div>
      )}

      {/* 6. TEAM & COLLABORATION */}
      {panelType === 'team' && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Users size={18} style={{ color: '#38BDF8' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Team & Collaboration
            </h3>
          </div>

          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}`, marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Project Metadata
            </span>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
              <div><strong>Project:</strong> {projectName}</div>
              <div><strong>Category:</strong> {projectType}</div>
              <div><strong>Status:</strong> Active Academic Workspace</div>
            </div>
          </div>

          <div style={{ backgroundColor: cardBg, padding: '0.85rem', borderRadius: '8px', border: `1px solid ${borderCol}` }}>
            <span style={{ fontSize: '0.725rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Access & Roles
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Award size={16} style={{ color: '#F59E0B' }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Authenticated Student Author</div>
                <div style={{ fontSize: '0.7rem', color: textMuted }}>Full Read, Write, Execute, and Export privileges</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

