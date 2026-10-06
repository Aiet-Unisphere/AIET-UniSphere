import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search, Filter, Users, ArrowRight, Plus, ExternalLink, Award } from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { getFacultyCourses } from '../../services/courseService';
import type { FacultyCourseItem } from '../../services/courseService';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';

// External Learning Imports
import {
  getFacultyExternalLearningData,
  type FacultyExternalDashboardData,
  type FacultyAssignmentSummaryItem
} from '../../services/externalLearningService';
import { CreateExternalCourseModal } from '../components/CreateExternalCourseModal';
import { AssignExternalCourseModal } from '../components/AssignExternalCourseModal';
import { ExternalCourseStudentProgressModal } from '../components/ExternalCourseStudentProgressModal';
import { ExternalCourseVerificationQueue } from '../components/ExternalCourseVerificationQueue';

export const FacultyCoursesList: React.FC = () => {
  const navigate = useNavigate();

  // Active Tab: 'academic' (default) | 'external'
  const [activeTab, setActiveTab] = useState<'academic' | 'external'>('academic');

  // Academic Courses state
  const [academicCourses, setAcademicCourses] = useState<FacultyCourseItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string>('All');
  const [isAcademicLoading, setIsAcademicLoading] = useState(true);
  const [isCreateAcademicAssignmentOpen, setIsCreateAcademicAssignmentOpen] = useState(false);

  // External Learning state
  const [externalDashboard, setExternalDashboard] = useState<FacultyExternalDashboardData | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalSubTab, setExternalSubTab] = useState<'assignments' | 'queue'>('assignments');

  // External Modals state
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isAssignCourseModalOpen, setIsAssignCourseModalOpen] = useState(false);
  const [selectedSummaryItemForRoster, setSelectedSummaryItemForRoster] = useState<FacultyAssignmentSummaryItem | null>(null);

  // Load Academic Courses
  const loadAcademicData = () => {
    setIsAcademicLoading(true);
    getFacultyCourses().then((res) => {
      setAcademicCourses(res);
      setIsAcademicLoading(false);
    }).catch((err) => {
      console.error('Failed to load academic courses:', err);
      setIsAcademicLoading(false);
    });
  };

  // Load External Learning Data
  const loadExternalData = async () => {
    setIsExternalLoading(true);
    setExternalError(null);
    try {
      const data = await getFacultyExternalLearningData();
      setExternalDashboard(data);
    } catch (err: any) {
      setExternalError(err.message || 'Unable to load faculty external learning dashboard.');
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
  const filteredAcademicCourses = academicCourses.filter(course => {
    const matchesSearch = course.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          course.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSem = selectedSemester === 'All' || course.semester?.toString() === selectedSemester;
    return matchesSearch && matchesSem;
  });

  return (
    <FacultyAppShell>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand-black)' }}>
            My Courses & Assignments
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', fontWeight: 500, marginTop: '0.2rem' }}>
            Manage academic curriculum subjects, monitor student attendance, and assign external MOOC certifications.
          </p>
        </div>

        {/* Action Button based on active mode */}
        {activeTab === 'academic' ? (
          <button className="btn btn-primary" onClick={() => setIsCreateAcademicAssignmentOpen(true)}>
            <Plus size={16} />
            <span>Create Assignment</span>
          </button>
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
          {externalDashboard?.metrics.pendingVerificationCount ? (
            <span style={{ backgroundColor: '#EF4444', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 700 }}>
              {externalDashboard.metrics.pendingVerificationCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* MODE 1: Academic Courses */}
      {activeTab === 'academic' && (
        <>
          {/* Filter and Search Bar */}
          <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="header-search" style={{ flexGrow: 1, minWidth: '260px', width: 'auto' }}>
                <Search size={16} className="header-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search by course name or code..."
                  className="header-search-input"
                  style={{ width: '100%' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={16} style={{ color: 'var(--brand-dark-grey)' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Semester:</span>
                <select 
                  className="header-search-input" 
                  style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                >
                  <option value="All">All Semesters</option>
                  <option value="7">Semester 7</option>
                  <option value="6">Semester 6</option>
                  <option value="4">Semester 4</option>
                </select>
              </div>
            </div>
          </div>

          {/* Course Cards Grid */}
          {isAcademicLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
              Loading academic courses...
            </div>
          ) : filteredAcademicCourses.length === 0 ? (
            <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <BookOpen size={40} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No Academic Courses Found</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
                No course records matched your search query or semester filter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {filteredAcademicCourses.map((course) => (
                <div key={course.id} className="dashboard-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-graded">{course.code}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Sem {course.semester}</span>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.2rem' }}>
                      {course.name}
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', lineHeight: '1.4' }}>
                      {course.department}
                    </p>
                  </div>

                  <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.75rem', borderRadius: 'var(--border-radius)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                    <div>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-black)', display: 'block' }}>{course.studentCount}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Enrolled</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-blue)', display: 'block' }}>{course.averageAttendancePercent == null ? '—' : `${course.averageAttendancePercent}%`}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Avg Attendance</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-orange)', display: 'block' }}>{course.activeAssignmentsCount}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Active Assign</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
                      Next: No upcoming activity
                    </span>

                    <button 
                      className="btn btn-primary" 
                      style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem' }}
                      onClick={() => navigate(`/faculty/courses/${course.id}`)}
                    >
                      <span>Open Course</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODE 2: External Learning (MOOCs) */}
      {activeTab === 'external' && (
        <>
          {isExternalLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
              Loading faculty external learning dashboard...
            </div>
          ) : externalError ? (
            <div className="dashboard-panel" style={{ textAlign: 'center', padding: '2.5rem', color: '#DC2626' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Unable to Load Dashboard</h3>
              <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '0.25rem', marginBottom: '1rem' }}>{externalError}</p>
              <button className="btn btn-secondary" onClick={loadExternalData}>Retry</button>
            </div>
          ) : (
            <>
              {/* Summary Metrics Cards Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-black)', display: 'block' }}>
                    {externalDashboard?.metrics.assignedCoursesCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Course Definitions</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-blue)', display: 'block' }}>
                    {externalDashboard?.metrics.activeAssignmentsCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Active Cohort Assignments</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4F46E5', display: 'block' }}>
                    {externalDashboard?.metrics.totalStudentsAssigned || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Enrolled Students</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem', backgroundColor: externalDashboard?.metrics.pendingVerificationCount ? '#FEF2F2' : '#F9FAFB', border: externalDashboard?.metrics.pendingVerificationCount ? '1px solid #FCA5A5' : '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: externalDashboard?.metrics.pendingVerificationCount ? '#DC2626' : '#059669', display: 'block' }}>
                    {externalDashboard?.metrics.pendingVerificationCount || 0}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Pending Verification</span>
                </div>

                <div className="dashboard-panel" style={{ textAlign: 'center', padding: '1rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', display: 'block' }}>
                    {externalDashboard?.metrics.completionRatePercent || 0}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Completion Rate</span>
                </div>
              </div>

              {/* Sub-tabs: Assignments vs Verification Queue */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setExternalSubTab('assignments')}
                  className={`btn ${externalSubTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  <BookOpen size={16} />
                  Assigned Courses & Roster
                </button>

                <button
                  type="button"
                  onClick={() => setExternalSubTab('queue')}
                  className={`btn ${externalSubTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem' }}
                >
                  <Award size={16} />
                  Verification Queue ({externalDashboard?.metrics.pendingVerificationCount || 0})
                </button>
              </div>

              {/* SUB-TAB 1: Assigned Courses & Roster */}
              {externalSubTab === 'assignments' && (
                <>
                  {externalDashboard?.assignmentSummaries.length === 0 ? (
                    <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                      <ExternalLink size={40} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem auto' }} />
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No External Learning Assignments</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', marginBottom: '1rem' }}>
                        You haven't assigned any MOOC courses to a department cohort yet.
                      </p>
                      <button className="btn btn-primary" onClick={() => setIsAssignCourseModalOpen(true)}>
                        <Plus size={16} />
                        Assign Course to Cohort
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
                      {externalDashboard?.assignmentSummaries.map((summary) => (
                        <div key={summary.assignment.id} className="dashboard-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="badge badge-graded">{summary.course.platform}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
                              Sem {summary.assignment.semester || 'All'} · {summary.assignment.academic_year || '2026–27'}
                            </span>
                          </div>

                          <div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--brand-black)', marginBottom: '0.2rem' }}>
                              {summary.course.title}
                            </h3>
                            {summary.assignment.academic_course_id && (
                              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#F3F4F6', color: '#374151', fontWeight: 500 }}>
                                Linked Subject: {summary.assignment.academic_course_id}
                              </span>
                            )}
                          </div>

                          {/* Stats Grid */}
                          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '0.75rem', borderRadius: 'var(--border-radius)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.35rem', textAlign: 'center', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                            <div>
                              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-black)', display: 'block' }}>{summary.enrolledStudentsCount}</span>
                              <span style={{ fontSize: '0.675rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Students</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#059669', display: 'block' }}>{summary.completedCount}</span>
                              <span style={{ fontSize: '0.675rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Completed</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--brand-blue)', display: 'block' }}>{summary.inProgressCount}</span>
                              <span style={{ fontSize: '0.675rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>In Progress</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: summary.pendingVerificationCount ? '#DC2626' : 'var(--brand-dark-grey)', display: 'block' }}>{summary.pendingVerificationCount}</span>
                              <span style={{ fontSize: '0.675rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>Pending Ev.</span>
                            </div>
                          </div>

                          <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
                              Due: {summary.assignment.deadline ? new Date(summary.assignment.deadline).toLocaleDateString() : 'No deadline'}
                            </span>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                              onClick={() => setSelectedSummaryItemForRoster(summary)}
                            >
                              <Users size={14} />
                              View Roster & Progress
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* SUB-TAB 2: Verification Queue */}
              {externalSubTab === 'queue' && (
                <ExternalCourseVerificationQueue
                  queue={externalDashboard?.verificationQueue || []}
                  onRefresh={loadExternalData}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Academic Create Assignment Modal */}
      <CreateAssignmentModal 
        isOpen={isCreateAcademicAssignmentOpen}
        onClose={() => setIsCreateAcademicAssignmentOpen(false)}
        onSuccess={loadAcademicData}
      />

      {/* External Modals */}
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
        courses={externalDashboard?.courses || []}
        departmentId={externalDashboard?.courses[0]?.created_by || ''}
        onClose={() => setIsAssignCourseModalOpen(false)}
        onSuccess={loadExternalData}
      />

      <ExternalCourseStudentProgressModal
        summaryItem={selectedSummaryItemForRoster}
        onClose={() => setSelectedSummaryItemForRoster(null)}
        onRefresh={loadExternalData}
      />
    </FacultyAppShell>
  );
};

export default FacultyCoursesList;
