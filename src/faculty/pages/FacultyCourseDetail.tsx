import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  Users, 
  ClipboardList, 
  CalendarCheck, 
  ArrowLeft, 
  Plus, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  Download,
  Trash2,
  Edit2,
  Search,
  Filter,
  ExternalLink
} from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { 
  getFacultyCourseById, 
  getCourseMaterials, 
  deriveCourseModules, 
  deleteCourseMaterial, 
  downloadCourseMaterial,
  getCourseMaterialUrl,
  type FacultyCourseItem,
  type CourseMaterialItem,
  type CourseModuleItem
} from '../../services/courseService';
import { getStudentsByCourse } from '../../services/studentService';
import type { ExtendedStudent } from '../../data/students';
import { getAssignments } from '../../services/assignmentService';
import type { Assignment } from '../../data/assignments';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';
import { UploadCourseMaterialModal } from '../components/UploadCourseMaterialModal';
import { EditCourseMaterialModal } from '../components/EditCourseMaterialModal';
import { getFacultyAttendanceLogs } from '../../services/attendanceService';
import type { AttendanceSessionLog } from '../../services/attendanceService';

export const FacultyCourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<FacultyCourseItem | null>(null);
  const [students, setStudents] = useState<ExtendedStudent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [materials, setMaterials] = useState<CourseMaterialItem[]>([]);
  const [modules, setModules] = useState<CourseModuleItem[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSessionLog[]>([]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'students' | 'assignments' | 'attendance'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals & Actions
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [isUploadMaterialOpen, setIsUploadMaterialOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<CourseMaterialItem | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Materials search & filter
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState('All');
  const [statusToast, setStatusToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setStatusToast({ type, message });
    setTimeout(() => setStatusToast(null), 5000);
  };

  const loadAllCourseData = async () => {
    if (!id) {
      setLoadError('Course identifier is missing.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [crs, stds, assgs, sessions] = await Promise.all([
        getFacultyCourseById(id),
        getStudentsByCourse(id),
        getAssignments(),
        getFacultyAttendanceLogs(),
      ]);

      if (!crs) {
        setCourse(null);
        setLoadError('Course not found or access denied.');
        setIsLoading(false);
        return;
      }

      setCourse(crs);
      setStudents(stds);

      const filteredAssignments = assgs.filter(a => a.courseId === crs.id || a.courseId === crs.code);
      setAssignments(filteredAssignments);

      const filteredSessions = sessions.filter(session => session.courseCode === crs.id || session.courseCode === crs.code);
      setAttendanceSessions(filteredSessions);

      // Fetch actual course materials
      const mats = await getCourseMaterials(crs.id, crs.code);
      setMaterials(mats);

      // Derive authentic module groupings from materials and assignments
      const derivedMods = deriveCourseModules(mats, filteredAssignments);
      setModules(derivedMods);
      crs.modules = derivedMods;

      setIsLoading(false);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load course details.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllCourseData();
  }, [id]);

  const handleDownloadMaterial = async (mat: CourseMaterialItem) => {
    if (!mat.storagePath) {
      showToast('error', 'File storage path is unavailable.');
      return;
    }
    try {
      await downloadCourseMaterial(mat.storagePath, mat.fileName);
      showToast('success', `Downloading ${mat.fileName}...`);
    } catch (err: any) {
      showToast('error', err.message || 'Unable to download material.');
    }
  };

  const handlePreviewMaterial = async (mat: CourseMaterialItem) => {
    if (!mat.storagePath) return;
    try {
      const url = await getCourseMaterialUrl(mat.storagePath);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        showToast('error', 'Preview URL could not be generated.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Unable to preview file.');
    }
  };

  const handleDeleteMaterial = async (mat: CourseMaterialItem) => {
    if (!confirm(`Are you sure you want to delete "${mat.title}"? This permanently removes the file and database record.`)) {
      return;
    }

    setIsDeletingId(mat.id);
    try {
      await deleteCourseMaterial(mat.id, mat.storagePath);
      showToast('success', `Material "${mat.title}" deleted successfully.`);
      await loadAllCourseData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete material.');
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <FacultyAppShell>
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Loading course details...
        </div>
      </FacultyAppShell>
    );
  }

  if (loadError || !course) {
    return (
      <FacultyAppShell>
        <div className="dashboard-panel" role="alert" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <AlertTriangle size={32} style={{ color: 'var(--color-error)', margin: '0 auto 0.5rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>Course Access Error</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.35rem' }}>{loadError || 'Course not found.'}</p>
          <button className="btn btn-secondary" style={{ width: 'auto', margin: '1rem auto 0' }} onClick={() => navigate('/faculty/courses')}>
            Back to Courses
          </button>
        </div>
      </FacultyAppShell>
    );
  }

  // Filtered materials
  const filteredMaterials = materials.filter(m => {
    const q = materialSearch.toLowerCase().trim();
    const matchesSearch = !q || m.title.toLowerCase().includes(q) || m.fileName.toLowerCase().includes(q);
    const matchesModule = selectedModuleFilter === 'All' || m.moduleId === selectedModuleFilter;
    return matchesSearch && matchesModule;
  });

  const existingModuleNames = Array.from(new Set(materials.map(m => m.moduleId || 'General'))).filter(Boolean);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <FacultyAppShell>
      {/* Toast Feedback */}
      {statusToast && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1rem',
            borderRadius: '8px',
            backgroundColor: statusToast.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${statusToast.type === 'success' ? '#6EE7B7' : '#FCA5A5'}`,
            color: statusToast.type === 'success' ? '#065F46' : '#991B1B',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}
        >
          {statusToast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{statusToast.message}</span>
        </div>
      )}

      {/* Back Button & Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button 
          className="btn btn-secondary" 
          style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginBottom: '0.85rem' }}
          onClick={() => navigate('/faculty/courses')}
        >
          <ArrowLeft size={14} />
          <span>Back to Courses</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-graded font-mono">{course.code}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                {course.department} · Semester {course.semester}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)', margin: 0 }}>
              {course.name}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setIsUploadMaterialOpen(true)}>
              <Plus size={16} />
              <span>Upload Material</span>
            </button>
            <button className="btn btn-secondary" onClick={() => setIsCreateAssignmentOpen(true)}>
              <Plus size={16} />
              <span>Create Assignment</span>
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/faculty/attendance')}>
              <CalendarCheck size={16} />
              <span>Mark Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="dashboard-panel" style={{ padding: '0.45rem 0.65rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: 'Overview', icon: <BookOpen size={16} /> },
            { id: 'materials', label: `Course Materials (${materials.length})`, icon: <FileText size={16} /> },
            { id: 'students', label: `Enrolled Students (${students.length})`, icon: <Users size={16} /> },
            { id: 'assignments', label: `Assignments (${assignments.length})`, icon: <ClipboardList size={16} /> },
            { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={16} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Description */}
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>Course Description</h3>
            <p style={{ lineHeight: '1.6', fontSize: '0.9rem', color: 'var(--brand-dark-grey)', margin: 0 }}>
              {course.description || `${course.name} (${course.code}) curriculum, lecture resources, syllabus modules, and student coursework evaluations.`}
            </p>
          </div>

          {/* Module Syllabus Breakdown */}
          <div className="dashboard-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1.05rem', margin: 0 }}>Syllabus Modules &amp; Materials</h3>
              <button 
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
                onClick={() => setIsUploadMaterialOpen(true)}
              >
                <Plus size={14} />
                <span>Add Material to Module</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {modules.map((mod) => (
                <div 
                  key={mod.id} 
                  style={{ 
                    padding: '0.85rem 1rem', 
                    borderRadius: 'var(--border-radius)', 
                    backgroundColor: 'var(--brand-light-grey)', 
                    border: '1px solid rgba(156, 163, 175, 0.2)' 
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-orange)', marginRight: '0.5rem', fontFamily: 'monospace' }}>
                        {mod.id.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--brand-black)' }}>
                        {mod.title}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                      <span>📚 {mod.materialsCount} {mod.materialsCount === 1 ? 'Reading' : 'Readings'}</span>
                      <span>📝 {mod.assignmentsCount} {mod.assignmentsCount === 1 ? 'Assignment' : 'Assignments'}</span>
                    </div>
                  </div>

                  {/* Nested materials in this module */}
                  {mod.materials && mod.materials.length > 0 && (
                    <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Reference Files in this Module:
                      </span>
                      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.25rem', fontSize: '0.825rem' }}>
                        {mod.materials.map(m => (
                          <li key={m.id} style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>
                              <strong>{m.title}</strong> <span style={{ color: '#64748B' }}>({m.fileName})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadMaterial(m)}
                              style={{ background: 'none', border: 'none', color: 'var(--brand-blue)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <Download size={12} /> Download
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              {modules.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--brand-dark-grey)' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>No syllabus modules or academic materials uploaded yet.</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Click <strong>"Upload Material"</strong> to attach reference PDFs, lecture slides, or syllabus modules.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COURSE MATERIALS */}
      {activeTab === 'materials' && (
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 className="panel-title" style={{ fontSize: '1.1rem', margin: 0 }}>Course Reference Materials</h3>
              <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', margin: '0.15rem 0 0' }}>
                Securely uploaded teaching resources, lecture slide decks, and reference documentation.
              </p>
            </div>

            <button className="btn btn-primary" onClick={() => setIsUploadMaterialOpen(true)}>
              <Plus size={16} />
              <span>Upload New Material</span>
            </button>
          </div>

          {/* Filters & Search */}
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem 1rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ flexGrow: 1, minWidth: '220px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search materials by title or filename..."
                className="form-input"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                style={{ paddingLeft: '2.25rem', width: '100%', fontSize: '0.825rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-dark-grey)' }}>Module:</span>
              <select
                className="form-select"
                value={selectedModuleFilter}
                onChange={(e) => setSelectedModuleFilter(e.target.value)}
                style={{ fontSize: '0.825rem', padding: '0.35rem 0.65rem', minWidth: '130px' }}
              >
                <option value="All">All Modules</option>
                {existingModuleNames.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Materials Table */}
          {filteredMaterials.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--brand-dark-grey)' }}>
              <FileText size={38} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-black)', margin: 0 }}>
                {materialSearch || selectedModuleFilter !== 'All' ? 'No Matching Materials' : 'No Course Materials Uploaded'}
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '420px', margin: '0.35rem auto 1rem' }}>
                {materialSearch || selectedModuleFilter !== 'All'
                  ? 'Try clearing your search query or module filter to view all course materials.'
                  : 'Upload study notes, lecture slides, and syllabus documents to share with enrolled students.'}
              </p>
              <button className="btn btn-primary" style={{ width: 'auto', margin: '0 auto' }} onClick={() => setIsUploadMaterialOpen(true)}>
                <Plus size={16} />
                <span>Upload First Material</span>
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table font-sans">
                <thead>
                  <tr>
                    <th>Title &amp; Resource</th>
                    <th>Module</th>
                    <th>File Format</th>
                    <th>Size</th>
                    <th>Upload Date</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((mat) => (
                    <tr key={mat.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem' }}>
                          {mat.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                          <FileText size={13} style={{ color: 'var(--brand-blue)' }} />
                          <span className="font-mono">{mat.fileName}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                          {mat.moduleId || 'General'}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>
                          {mat.fileType}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.825rem', color: '#475569' }}>
                        {formatFileSize(mat.fileSize)}
                      </td>
                      <td style={{ fontSize: '0.825rem', color: '#475569' }}>
                        {new Date(mat.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            title="Preview file"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => handlePreviewMaterial(mat)}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            title="Download file"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => handleDownloadMaterial(mat)}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            title="Edit metadata"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => setEditingMaterial(mat)}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            title="Delete material"
                            disabled={isDeletingId === mat.id}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto', color: 'var(--color-error)' }}
                            onClick={() => handleDeleteMaterial(mat)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STUDENTS */}
      {activeTab === 'students' && (
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="table font-sans">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>USN</th>
                  <th>Attendance</th>
                  <th>Assignment Status</th>
                  <th>Academic Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((std) => (
                  <tr key={std.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{std.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{std.email}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{std.usn}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: std.attendancePercent && std.attendancePercent < 75 ? 'var(--color-error)' : 'var(--brand-blue)' }}>
                        {std.attendancePercent != null ? `${std.attendancePercent}%` : 'Not provided'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {std.assignmentsCompleted != null ? `${std.assignmentsCompleted} / ${std.assignmentsTotal || 0} Done` : 'Not tracked'}
                    </td>
                    <td>
                      <span className={`badge ${
                        std.academicStatus === 'Good Standing' ? 'badge-graded' :
                        std.academicStatus === 'Warning' ? 'badge-overdue' : 'badge-pending'
                      }`} style={{ fontSize: '0.75rem' }}>
                        {std.academicStatus}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary" 
                        style={{ width: 'auto', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                        onClick={() => navigate(`/faculty/students/${std.id}`)}
                      >
                        <span>View Detail</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem' }}>
            <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>Course Assignments</h3>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setIsCreateAssignmentOpen(true)}>
              <Plus size={15} />
              <span>Create Assignment</span>
            </button>
          </div>

          {assignments.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--brand-dark-grey)' }}>
              No assignments posted for this course yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {assignments.map((assg) => (
                <div key={assg.id} style={{ padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', backgroundColor: 'var(--brand-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--brand-black)' }}>{assg.title}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
                      Due Date: {new Date(assg.deadline).toLocaleString()} · Total Marks: {assg.marks}
                    </p>
                  </div>
                  <button 
                    className="btn btn-secondary" 
                    style={{ width: 'auto', fontSize: '0.8rem' }}
                    onClick={() => navigate(`/faculty/assignments/${assg.id}`)}
                  >
                    <span>Open Submissions</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="dashboard-panel">
          <div className="panel-header-row" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 className="panel-title" style={{ fontSize: '1.1rem' }}>Attendance Overview</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                Average Course Attendance: <strong>{course.averageAttendancePercent == null ? 'No sessions recorded' : `${course.averageAttendancePercent}%`}</strong>
              </p>
            </div>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={() => navigate('/faculty/attendance')}>
              <CalendarCheck size={16} />
              <span>Mark Today's Attendance</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Students Below 75% Threshold</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {students.filter(s => s.attendancePercent != null && s.attendancePercent < 75).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>{s.name} ({s.usn})</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>{s.attendancePercent}%</span>
                  </div>
                ))}
                {students.filter(s => s.attendancePercent != null && s.attendancePercent < 75).length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>No students currently below the 75% attendance threshold.</p>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recent Class Sessions</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--brand-dark-grey)' }}>
                {attendanceSessions.slice(0, 5).map(session => (
                  <div key={session.id}>{new Date(session.date).toLocaleDateString()} {session.timeSlot} — {session.presentCount} Present, {session.absentCount} Absent, {session.lateCount} Late</div>
                ))}
                {attendanceSessions.length === 0 && <p>No attendance sessions have been recorded for this course.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateAssignmentModal 
        isOpen={isCreateAssignmentOpen}
        defaultCourseId={course.id}
        defaultCourseName={course.name}
        onClose={() => setIsCreateAssignmentOpen(false)}
        onSuccess={loadAllCourseData}
      />

      <UploadCourseMaterialModal
        isOpen={isUploadMaterialOpen}
        courseId={course.id}
        courseName={course.name}
        existingModules={existingModuleNames}
        onClose={() => setIsUploadMaterialOpen(false)}
        onSuccess={() => {
          showToast('success', 'Course material uploaded successfully!');
          loadAllCourseData();
        }}
      />

      <EditCourseMaterialModal
        material={editingMaterial}
        isOpen={!!editingMaterial}
        existingModules={existingModuleNames}
        onClose={() => setEditingMaterial(null)}
        onSuccess={() => {
          showToast('success', 'Material metadata updated successfully!');
          loadAllCourseData();
        }}
      />
    </FacultyAppShell>
  );
};

export default FacultyCourseDetail;
