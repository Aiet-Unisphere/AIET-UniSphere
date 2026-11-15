import React, { useState, useRef } from 'react';
import { 
  Upload, FolderUp, FileArchive, CheckCircle2, 
  AlertTriangle, ShieldCheck, X, FileCode, Layers, Sparkles, Loader2
} from 'lucide-react';
import { 
  inspectAndAnalyzeImport, 
  extractZipArchive, 
  commitImportedProjectWorkspace,
  type ImportAnalysisResult,
  type RawImportFile 
} from '../services/projectImportService';

interface WorkspaceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (projectId: string) => void;
}

export const WorkspaceImportModal: React.FC<WorkspaceImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [importTab, setImportTab] = useState<'folder' | 'zip'>('folder');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImportAnalysisResult | null>(null);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process folder selection via webkitdirectory
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const rawFiles: Array<{ path: string; name: string; size: number; content: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // webkitRelativePath gives e.g. "my-project/src/App.tsx"
        const relativePath = file.webkitRelativePath || file.name;
        
        // Skip binary read or large files for text parsing
        let content = '';
        if (file.size < 2 * 1024 * 1024 && !file.type.startsWith('image/')) {
          try {
            content = await file.text();
          } catch {
            content = '[Binary Data]';
          }
        }

        rawFiles.push({
          path: relativePath,
          name: file.name,
          size: file.size,
          content
        });
      }

      const inferredName = files[0]?.webkitRelativePath.split('/')[0] || 'My Local Project';
      const result = inspectAndAnalyzeImport(rawFiles, inferredName);
      setAnalysisResult(result);
      setCustomName(result.projectName);
      setCustomDesc(`Imported ${result.technologies.framework} project (${result.technologies.language})`);
    } catch (err: any) {
      setError(`Failed to read folder contents: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Process ZIP archive selection
  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const zipFile = files[0];
    if (!zipFile.name.endsWith('.zip')) {
      setError('Please select a valid .zip archive file.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const buffer = await zipFile.arrayBuffer();
      const extracted = await extractZipArchive(new Uint8Array(buffer));
      const baseName = zipFile.name.replace(/\.zip$/i, '');
      const result = inspectAndAnalyzeImport(extracted, baseName);
      setAnalysisResult(result);
      setCustomName(result.projectName);
      setCustomDesc(`Imported ${result.technologies.framework} project (${result.technologies.language})`);
    } catch (err: any) {
      setError(`ZIP archive parsing failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Confirm import and create project workspace
  const handleConfirmImport = async () => {
    if (!analysisResult) return;
    setIsCommitting(true);
    setError(null);

    try {
      const { projectId } = await commitImportedProjectWorkspace(analysisResult, customName, customDesc);
      onImportComplete(projectId);
      onClose();
    } catch (err: any) {
      setError(`Failed to commit workspace: ${err.message}`);
      setIsCommitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(3px)',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(230, 81, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-orange)'
            }}>
              <Upload size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-black)' }}>
                Import Existing Project
              </h2>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                Load your local engineering project folder or ZIP archive into UniSphere Code Studio
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {error && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {!analysisResult ? (
            <>
              {/* Method Switcher Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setImportTab('folder')}
                  style={{
                    padding: '0.5rem 0.25rem',
                    border: 'none',
                    background: 'none',
                    borderBottom: importTab === 'folder' ? '2px solid var(--brand-orange)' : '2px solid transparent',
                    color: importTab === 'folder' ? 'var(--brand-orange)' : '#64748B',
                    fontWeight: importTab === 'folder' ? 700 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <FolderUp size={16} />
                  <span>Import Local Folder</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTab('zip')}
                  style={{
                    padding: '0.5rem 0.25rem',
                    border: 'none',
                    background: 'none',
                    borderBottom: importTab === 'zip' ? '2px solid var(--brand-orange)' : '2px solid transparent',
                    color: importTab === 'zip' ? 'var(--brand-orange)' : '#64748B',
                    fontWeight: importTab === 'zip' ? 700 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <FileArchive size={16} />
                  <span>Upload ZIP Archive</span>
                </button>
              </div>

              {/* Upload Dropzones */}
              {importTab === 'folder' ? (
                <div
                  onClick={() => folderInputRef.current?.click()}
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: '8px',
                    padding: '2.5rem 1.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#F8FAFC',
                    transition: 'border-color 0.2s ease-in-out'
                  }}
                >
                  <input
                    type="file"
                    ref={folderInputRef}
                    onChange={handleFolderSelect}
                    style={{ display: 'none' }}
                    {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
                  />
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#EFF6FF', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <FolderUp size={24} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--brand-black)' }}>
                    Choose a project folder from your computer
                  </h3>
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Select any project directory. Relative paths, subfolders, and source code will be preserved.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: '1rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                  >
                    Select Folder
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => zipInputRef.current?.click()}
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: '8px',
                    padding: '2.5rem 1.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#F8FAFC',
                    transition: 'border-color 0.2s ease-in-out'
                  }}
                >
                  <input
                    type="file"
                    ref={zipInputRef}
                    accept=".zip"
                    onChange={handleZipSelect}
                    style={{ display: 'none' }}
                  />
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <FileArchive size={24} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--brand-black)' }}>
                    Select a ZIP archive to upload
                  </h3>
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Archives up to 50MB compressed / 100MB uncompressed are supported.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: '1rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                  >
                    Select ZIP File
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <Loader2 size={24} className="spin" style={{ color: 'var(--brand-orange)', margin: '0 auto' }} />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Inspecting project structure, dependencies, and frameworks...
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Analysis & Import Preview View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} style={{ color: '#16A34A' }} />
                    <span style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>
                      Project Analysis Complete
                    </span>
                  </div>
                  <button
                    onClick={() => setAnalysisResult(null)}
                    style={{ border: 'none', background: 'none', color: 'var(--brand-blue)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Change Selection
                  </button>
                </div>

                {/* Technology Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#DBEAFE', color: '#1E40AF', fontSize: '0.75rem', fontWeight: 600 }}>
                    {analysisResult.technologies.language}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.75rem', fontWeight: 600 }}>
                    {analysisResult.technologies.framework}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E2E8F0', color: '#334155', fontSize: '0.75rem' }}>
                    Build: {analysisResult.technologies.buildSystem}
                  </span>
                  {analysisResult.technologies.entryPoint && (
                    <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#166534', fontSize: '0.75rem' }}>
                      Entry: {analysisResult.technologies.entryPoint}
                    </span>
                  )}
                </div>

                {/* Project Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <div style={{ backgroundColor: '#FFFFFF', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Importable Files</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-black)' }}>{analysisResult.validFiles.length}</div>
                  </div>
                  <div style={{ backgroundColor: '#FFFFFF', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Subfolders</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-black)' }}>{analysisResult.folderCount}</div>
                  </div>
                  <div style={{ backgroundColor: '#FFFFFF', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Workspace Size</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-black)' }}>
                      {(analysisResult.totalSizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable Name & Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="form-input"
                  placeholder="e.g. AI Vision Navigator"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                />
              </div>

              {/* Warnings Banner */}
              {analysisResult.warnings.length > 0 && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  fontSize: '0.75rem',
                  color: '#92400E',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}>
                  {analysisResult.warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Excluded Files Disclosure */}
              {analysisResult.excludedFiles.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowExcluded(!showExcluded)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#64748B',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontWeight: 600
                    }}
                  >
                    <ShieldCheck size={14} style={{ color: '#16A34A' }} />
                    <span>
                      {analysisResult.excludedFiles.length} unnecessary or sensitive files excluded by default {showExcluded ? '▲' : '▼'}
                    </span>
                  </button>

                  {showExcluded && (
                    <div style={{
                      marginTop: '0.5rem',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      backgroundColor: '#F1F5F9',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.7rem'
                    }}>
                      {analysisResult.excludedFiles.map((ex, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ fontFamily: 'monospace', color: '#334155' }}>{ex.path}</span>
                          <span style={{ color: '#64748B' }}>({ex.description})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          backgroundColor: '#F8FAFC',
          borderRadius: '0 0 12px 12px'
        }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
          >
            Cancel
          </button>

          {analysisResult && (
            <button
              onClick={handleConfirmImport}
              disabled={isCommitting || !customName.trim()}
              className="btn btn-primary"
              style={{
                padding: '0.45rem 1.25rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: 'var(--brand-orange)',
                borderColor: 'var(--brand-orange)'
              }}
            >
              {isCommitting ? (
                <>
                  <Loader2 size={14} className="spin" />
                  <span>Importing Workspace...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Confirm & Launch Code Studio</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

