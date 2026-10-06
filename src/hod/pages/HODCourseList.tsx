import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, Eye, Filter, ExternalLink, Plus, Award, CheckCircle2 } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { getDepartmentCourses } from '../../services/courseService';
import type { FacultyCourseItem } from '../../services/courseService';

// External Learning Imports
import {
  getHODExternalLearningOverview,
  type HODExternalDashboardData,
  type FacultyAssignmentSummaryItem
} from '../../services/externalLearningService';
import { HODExternalLearningAssignments } from '../components/HODExternalLearningAssignments';
import { HODExternalLearningStudentMatrix } from '../components/HODExternalLearningStudentMatrix';
import { HODAssignmentDetailModal } from '../components/HODAssignmentDetailModal';
import { CreateExternalCourseModal } from '../../faculty/components/CreateExternalCourseModal';
import { AssignExternalCourseModal } from '../../faculty/components/AssignExternalCourseModal';
import { ExternalCourseVerificationQueue } from '../../faculty/components/ExternalCourseVerificationQueue';

export const HODCourseList: React.FC = () => {
  const navigate = useNavigate();

  // Mode Switcher: 'academic' (default) | 'external'
  const [activeTab, setActiveTab] = useState<'academic' | 'external'>('academic');

  // Academic Courses State
  const [courses, setCourses] = useState<FacultyCourseItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  // External Learning State
  const [externalOverview, setExternalOverview] = useState<HODExternalDashboardData | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalSubTab, setExternalSubTab] = useState<'assignments' | 'matrix' | 'queue'>('assignments');

  // Modals state
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isAssignCourseModalOpen, setIsAssignCourseModalOpen] = useState(false);
  const [selectedAssignmentForDetail, setSelectedAssignmentForDetail] = useState<FacultyAssignmentSummaryItem | null>(null);

  // Load Academic Courses
  const loadAcademicData = async () => {
    setLoading(true);
    try {
      const data = await getDepartmentCourses();
      setCourses(data);
    } catch (err) {
      console.error("Error loading department courses:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load External Learning Data
  const loadExternalData = async () => {
    setIsExternalLoading(true);
    setExternalError(null);
    try {
      const overview = await getHODExternalLearningOverview();
      setExternalOverview(overview);
    } catch (err: any) {
      setExternalError(err.message || 'Unable to load departmental external learning overview.');
    } finally {
      setIsExternalLoading(false);
    }
  };

  useEffect(() => {
    loadAcademicData();
  }, []);

  useEffect(() => {
    if (activeTab === 'external') {
      loadExternalData();
    }
  }, [activeTab]);

  // Filter Academic Courses
  const filteredCourses = courses.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.faculty.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSemester = semesterFilter === 'All' || c.semester?.toString() === semesterFilter;

    return matchesSearch && matchesSemester;
  });

  return (
    <HODAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono">DEPARTMENT MANAGEMENT</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Course Catalog
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {externalOverview?.departmentName || courses[0]?.department || 'Department'} active courses, faculty allocations & external MOOC tracking
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {activeTab === 'academic' ? (
            <div style={{ backgroundColor: 'var(--brand-white)', padding: '0.5rem 0.85rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-black)' }}>
              Active Courses: <span style={{ color: 'var(--brand-orange)', fontWeight: 800 }}>{courses.length}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setIsCreateCourseModalOpen(true)}>
                <Plus size={16} />
                <span>New Course Definition</span>
              </button>
              <button className="btn btn-primary" onClick={() => setIsAssignCourseModalOpen(true)}>
                <Plus size={16} />
                <span>Assign to Cohort</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #E5E7EB' }}>
        <button
          type="button"
          onClick={() => setActiveTab('academic')}
          style={{
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.925rem',
            color: activeTab === 'academic' ? 'var(--brand-blue, #2563EB)' : '#6B7280',
            borderBottom: activeTab === 'academic' ? '3px solid var(--brand-blue, #2563EB)' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <BookOpen size={18} />
          Academic Courses
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('external')}
          style={{
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.925rem',
            color: activeTab === 'external' ? 'var(--brand-blue, #2563EB)' : '#6B7280',
            borderBottom: activeTab === 'external' ? '3px solid var(--brand-blue, #2563EB)' : '3px solid transparent',
            background: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <ExternalLink size={18} />
          External Learning (MOOCs)
          {externalOverview?.metrics.pendingVerificationCount ? (
            <span style={{ backgroundColor: '#EF4444', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 700 }}>
              {externalOverview.metrics.pendingVerificationCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* MODE 1: Academic Courses */}
      {activeTab === 'academic' && (
        <>
          {/* Search and Filters */}
          <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Search Bar */}
              <div className="header-search" style={{ width: '320px', position: 'relative' }}>
                <Search size={16} className="header-search-icon" />
                <input
                  type="text"
                  placeholder="Search course name, code or faculty..."
                  className="header-search-input font-sans"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                  <Filter size={14} />
                  <span>Semester:</span>
                </div>
                <select
                  className="form-select font-sans"
                  style={{ width: '150px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                >
                  <option value="All">All Semesters</option>
                  <option value="6">Semester 6</option>
                  <option value="4">Semester 4</option>
                </select>
              </div>
            </div>
          </div>

          {/* Main Course List Table Container */}
          <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                Loading Department Courses...
              </div>
            ) : filteredCourses.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                <BookOpen size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
                <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No courses match your query</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                      <th style={{ padding: '1rem 1.25rem' }}>Course Code & Name</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Semester</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Assigned Faculty</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Students</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Attendance</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Assignments</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourses.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <div>
                            <div className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{c.code}</div>
                            <div style={{ fontWeight: 700, color: 'var(--brand-black)', fontSize: '0.9rem', marginTop: '0.1rem' }}>{c.name}</div>
                          </div>
                        </td>

                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: 600 }}>Semester {c.semester}</span>
                        </td>

                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>{c.faculty}</span>
                        </td>

                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: 600 }}>{c.studentCount} Students</span>
                        </td>

                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span className="font-mono" style={{ fontWeight: 700, color: c.averageAttendancePercent != null && c.averageAttendancePercent >= 80 ? 'var(--color-success)' : 'var(--brand-orange)' }}>
                            {c.averageAttendancePercent == null ? '—' : `${c.averageAttendancePercent}%`}
                          </span>
                        </td>

                        <td style={{ padding: '1rem 1.25rem' }}>
                          <span style={{ fontWeight: 600 }}>{c.activeAssignmentsCount} Active</span>
                        </td>

                        <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                          <button
                            onClick={() => navigate(`/hod/courses/${c.id}`)}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                          >
                            <Eye size={14} />
                            <span>View Details</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODE 2: External Learning (MOOCs) */}
      {activeTab === 'external' && (
        <>
          {isExternalLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
              Loading departmental external learning analytics...
            </div>
          ) : externalError ? (
            <div className="dashboard-panel" style={{ textAlign: 'center', padding: '2.5rem', color: '#DC2626' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Unable to Load Department Overview</h3>
              <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '0.25rem', marginBottom: '1rem' }}>{externalError}</p>
              <button className="btn btn-secondary" onClick={loadExternalData}>Retry</button>
            </div>
          ) : (
            <>
              {/* Summary Metrics Cards Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-black)', display: 'block' }}>
                    {externalOverview?.metrics.activeAssignmentsCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Active Assignments</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4F46E5', display: 'block' }}>
                    {externalOverview?.metrics.totalStudentsAssigned || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Students Assigned</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-blue)', display: 'block' }}>
                    {externalOverview?.metrics.inProgressCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>In Progress</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', display: 'block' }}>
                    {externalOverview?.metrics.completedCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Completed</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem', backgroundColor: externalOverview?.metrics.pendingVerificationCount ? '#FEF2F2' : '#F9FAFB', border: externalOverview?.metrics.pendingVerificationCount ? '1px solid #FCA5A5' : '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: externalOverview?.metrics.pendingVerificationCount ? '#DC2626' : '#059669', display: 'block' }}>
                    {externalOverview?.metrics.pendingVerificationCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Pending Verification</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem', backgroundColor: externalOverview?.metrics.overdueCount ? '#FFFBEB' : '#F9FAFB', border: externalOverview?.metrics.overdueCount ? '1px solid #FCD34D' : '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: externalOverview?.metrics.overdueCount ? '#D97706' : '#6B7280', display: 'block' }}>
                    {externalOverview?.metrics.overdueCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Overdue</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', display: 'block' }}>
                    {externalOverview?.metrics.completionRatePercent || 0}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Completion Rate</span>
                </div>
              </div>

              {/* Sub-tabs: Assignments vs Student Matrix vs Verification Queue */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setExternalSubTab('assignments')}
                  className={`btn ${externalSubTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  <BookOpen size={16} />
                  Department Assignments ({externalOverview?.assignmentSummaries.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setExternalSubTab('matrix')}
                  className={`btn ${externalSubTab === 'matrix' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  <Award size={16} />
                  Student Progress Matrix ({externalOverview?.studentMatrix.length || 0})
                </button>

                <button
                  type="button"
                  onClick={() => setExternalSubTab('queue')}
                  className={`btn ${externalSubTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  <CheckCircle2 size={16} />
                  Verification Queue ({externalOverview?.metrics.pendingVerificationCount || 0})
                </button>
              </div>

              {/* SUB-TAB 1: Department Assignments Table */}
              {externalSubTab === 'assignments' && (
                <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
                  <HODExternalLearningAssignments
                    assignments={externalOverview?.assignmentSummaries || []}
                    onSelectAssignment={(item) => setSelectedAssignmentForDetail(item)}
                    onAssignNewCourse={() => setIsAssignCourseModalOpen(true)}
                  />
                </div>
              )}

              {/* SUB-TAB 2: Student Progress Matrix */}
              {externalSubTab === 'matrix' && (
                <HODExternalLearningStudentMatrix
                  studentMatrix={externalOverview?.studentMatrix || []}
                />
              )}

              {/* SUB-TAB 3: Verification Queue */}
              {externalSubTab === 'queue' && (
                <ExternalCourseVerificationQueue
                  queue={externalOverview?.verificationQueue || []}
                  onRefresh={loadExternalData}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Modals */}
      <CreateExternalCourseModal
        isOpen={isCreateCourseModalOpen}
        onClose={() => setIsCreateCourseModalOpen(false)}
        onSuccess={() => {
          loadExternalData();
          setIsAssignCourseModalOpen(true);
        }}
      />

      <AssignExternalCourseModal
        isOpen={isAssignCourseModalOpen}
        courses={externalOverview?.courses || []}
        departmentId={externalOverview?.departmentId || ''}
        onClose={() => setIsAssignCourseModalOpen(false)}
        onSuccess={loadExternalData}
      />

      <HODAssignmentDetailModal
        summaryItem={selectedAssignmentForDetail}
        onClose={() => setSelectedAssignmentForDetail(null)}
      />
    </HODAppShell>
  );
};

export default HODCourseList;
