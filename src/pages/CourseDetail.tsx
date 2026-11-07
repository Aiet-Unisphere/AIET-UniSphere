import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  FolderDown, 
  Megaphone,
  FileText,
  Layers
} from 'lucide-react';
import { 
  getCourseById, 
  getCourseMaterials, 
  downloadCourseMaterial,
  deriveCourseModules
} from '../services/courseService';
import type { Course, CourseMaterialItem, CourseModuleItem } from '../services/courseService';
import { getAssignments } from '../services/assignmentService';
import type { Assignment } from '../services/assignmentService';
import { getAssessments } from '../services/assessmentService';
import type { Assessment } from '../data/assessments';
import { getAttendanceSummary } from '../services/attendanceService';
import { AppShell } from '../components/AppShell';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

interface GradedCourseworkRow {
  type: 'Assignment' | 'Assessment';
  name: string;
  scoreDisplay: string;
  status: string;
}

export const CourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [courseAssignments, setCourseAssignments] = useState<Assignment[]>([]);
  const [courseAssessments, setCourseAssessments] = useState<Assessment[]>([]);
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterialItem[]>([]);
  const [courseModules, setCourseModules] = useState<CourseModuleItem[]>([]);
  const [courseAttendance, setCourseAttendance] = useState<{
    percentage: number | null;
    display: string;
    held: number;
    attended: number;
  }>({ percentage: null, display: 'N/A', held: 0, attended: 0 });
  const [courseProgress, setCourseProgress] = useState<{
    percentage: number | null;
    display: string;
    total: number;
    completed: number;
  }>({ percentage: null, display: 'N/A', total: 0, completed: 0 });
  const [nextActivity, setNextActivity] = useState<string>('No upcoming sessions scheduled');
  const [gradedItems, setGradedItems] = useState<GradedCourseworkRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'materials' | 'assignments' | 'assessments' | 'announcements' | 'progress'>('overview');

  const fetchCourseDetails = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const courseData = await getCourseById(id);
      if (!courseData) {
        setError("Course not found.");
        return;
      }

      // Fetch related assignments, assessments, materials & attendance summary concurrently
      const [allAssignments, allAssessments, materials, attSummary] = await Promise.all([
        getAssignments(),
        getAssessments(),
        getCourseMaterials(courseData.id, courseData.code),
        getAttendanceSummary().catch(() => null)
      ]);

      // Filter assignments for this course
      const filteredAssignments = allAssignments.filter(a => 
        a.courseId === courseData.id || 
        (courseData.code && a.courseId === courseData.code) ||
        (a.courseName && courseData.name && a.courseName.toLowerCase() === courseData.name.toLowerCase())
      );

      // Filter assessments for this course
      const filteredAssessments = allAssessments.filter(a => 
        a.courseId === courseData.id || 
        (courseData.code && (a.courseCode === courseData.code || a.courseId === courseData.code)) ||
        (a.courseName && courseData.name && a.courseName.toLowerCase() === courseData.name.toLowerCase())
      );

      // 1. Calculate Course Attendance
      const matchingSubject = (attSummary?.subjects || []).find((s: any) => 
        (courseData.code && s.code?.toLowerCase() === courseData.code.toLowerCase()) ||
        (courseData.id && s.code?.toLowerCase() === courseData.id.toLowerCase()) ||
        (courseData.name && s.subject?.toLowerCase() === courseData.name.toLowerCase())
      );

      let attendancePct: number | null = null;
      let attendanceDisp = "N/A";
      let sessionsHeld = 0;
      let sessionsAttended = 0;

      if (matchingSubject) {
        sessionsHeld = matchingSubject.held;
        sessionsAttended = matchingSubject.attended;
        if (matchingSubject.held > 0) {
          attendancePct = matchingSubject.percentage;
          attendanceDisp = `${matchingSubject.percentage}%`;
        } else {
          attendanceDisp = "No sessions";
        }
      } else if (attSummary?.counts && attSummary.counts.totalConducted === 0) {
        attendanceDisp = "No sessions";
      }

      setCourseAttendance({
        percentage: attendancePct,
        display: attendanceDisp,
        held: sessionsHeld,
        attended: sessionsAttended
      });

      // 2. Calculate Course Progress (from genuine coursework completion)
      const completedAssignments = filteredAssignments.filter(a => a.status === 'Submitted' || a.status === 'Graded').length;
      const completedAssessments = filteredAssessments.filter(a => 
        a.studentAttempt && (a.studentAttempt.status === 'Submitted' || a.studentAttempt.status === 'Graded')
      ).length;

      const totalItems = filteredAssignments.length + filteredAssessments.length;
      const completedItems = completedAssignments + completedAssessments;

      let progressPct: number | null = null;
      let progressDisp = "N/A";

      if (totalItems > 0) {
        progressPct = Math.round((completedItems / totalItems) * 100);
        progressDisp = `${progressPct}%`;
      }

      setCourseProgress({
        percentage: progressPct,
        display: progressDisp,
        total: totalItems,
        completed: completedItems
      });

      // 3. Compute Next Class / Activity
      const upcomingAssessment = filteredAssessments.find(a => 
        ['Upcoming', 'Active'].includes(a.status) && a.date
      );
      const pendingAssignment = filteredAssignments.find(a => 
        a.status === 'Pending' && a.deadline && new Date(a.deadline) > new Date()
      );

      let nextAct = "No upcoming sessions scheduled";
      if (upcomingAssessment) {
        nextAct = `${upcomingAssessment.title} (${upcomingAssessment.date}${upcomingAssessment.time ? ' at ' + upcomingAssessment.time : ''})`;
      } else if (pendingAssignment) {
        nextAct = `${pendingAssignment.title} (Due: ${new Date(pendingAssignment.deadline).toLocaleDateString()})`;
      }
      setNextActivity(nextAct);

      // 4. Derive Course Modules
      const modules = deriveCourseModules(materials, filteredAssignments);
      setCourseModules(modules);

      // 5. Populate Graded Coursework rows
      const gradedRows: GradedCourseworkRow[] = [];
      filteredAssignments.forEach(a => {
        if (a.grade || a.status === 'Graded') {
          gradedRows.push({
            type: 'Assignment',
            name: a.title,
            scoreDisplay: a.grade ? `${a.grade.score} / ${a.marks}` : `${a.marks} Marks`,
            status: a.status
          });
        }
      });
      filteredAssessments.forEach(a => {
        if (a.studentAttempt && (a.studentAttempt.status === 'Graded' || a.studentAttempt.status === 'Submitted')) {
          const max = a.studentAttempt.maxScore ?? a.totalMarks ?? 100;
          const score = a.studentAttempt.score ?? 0;
          const pct = a.studentAttempt.percentage ?? Math.round((score / (max || 1)) * 100);
          gradedRows.push({
            type: 'Assessment',
            name: a.title,
            scoreDisplay: `${score} / ${max} (${pct}%)`,
            status: a.studentAttempt.status
          });
        }
      });
      setGradedItems(gradedRows);

      setCourseAssignments(filteredAssignments);
      setCourseAssessments(filteredAssessments);
      setCourseMaterials(materials);
      setCourse(courseData);
    } catch (err) {
      setError("Unable to load course details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCourseDetails();
  }, [id]);

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading course modules and details..." />
      </AppShell>
    );
  }

  if (error || !course) {
    return (
      <AppShell>
        <ErrorState message={error || "Failed to load course details"} onRetry={fetchCourseDetails} />
      </AppShell>
    );
  }

  const facultyDisplayName = course.facultyName || course.faculty || 'Faculty Instructor';
  const facultyInitials = facultyDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || 'FI';

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'modules', label: `Modules (${courseModules.length})` },
    { id: 'materials', label: `Materials (${courseMaterials.length})` },
    { id: 'assignments', label: `Assignments (${courseAssignments.length})` },
    { id: 'assessments', label: `Assessments (${courseAssessments.length})` },
    { id: 'announcements', label: 'Announcements' },
    { id: 'progress', label: 'Progress' }
  ];

  return (
    <AppShell>
      {/* Back Link */}
      <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
        <button 
          onClick={() => navigate('/student/courses')}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.825rem', gap: '0.35rem' }}
        >
          <ArrowLeft size={14} />
          Back to Courses
        </button>
      </div>

      {/* Course Heading Header */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="course-code-badge">{course.code}</span>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: '0.5rem' }}>
              {course.name}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem', fontWeight: 500 }}>
              Instructor: <strong style={{ color: 'var(--brand-black)' }}>{facultyDisplayName}</strong> · Semester {course.semester ?? 'N/A'}
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Attendance</span>
              <h2 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 700, 
                color: courseAttendance.percentage !== null && courseAttendance.percentage < 80 
                  ? 'var(--color-error)' 
                  : 'var(--brand-blue)' 
              }}>
                {courseAttendance.display}
              </h2>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>Coursework Complete</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-orange)' }}>
                {courseProgress.display}
              </h2>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(156, 163, 175, 0.1)', paddingTop: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem' }}>
            <strong>Next Class Session / Activity:</strong> {nextActivity}
          </p>
        </div>
      </div>

      {/* Course Tabs Navigation */}
      <div className="tabs-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div style={{ textAlign: 'left' }}>
        
        {/* OVERVIEW PANEL */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="dashboard-panel">
              <h3 className="panel-title">Course Description</h3>
              <p style={{ fontSize: '0.925rem', lineHeight: '1.6' }}>
                {course.description || `${course.name} (${course.code}) comprehensive curriculum syllabus, study materials, and student evaluations.`}
              </p>
            </div>

            <div className="dashboard-grid-two-col">
              <div className="dashboard-panel">
                <h3 className="panel-title">Faculty / Instructor Details</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                  <div className="profile-avatar" style={{ width: '48px', height: '48px', fontSize: '1.25rem' }}>
                    {facultyInitials}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{facultyDisplayName}</h4>
                    <p style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)' }}>Department of Computer Science & Engineering</p>
                    <p style={{ fontSize: '0.825rem', color: 'var(--brand-blue)' }}>office.hours@aiet.edu</p>
                  </div>
                </div>
              </div>

              <div className="dashboard-panel">
                <h3 className="panel-title">Upcoming Activity</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem' }}>
                    <strong>Next Activity:</strong> {nextActivity}
                  </p>
                  <p style={{ fontSize: '0.875rem' }}>
                    <strong>Course Code:</strong> {course.code}
                  </p>
                  <p style={{ fontSize: '0.875rem' }}>
                    <strong>Credits:</strong> {course.credits || 3} Credits
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODULES PANEL */}
        {activeTab === 'modules' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.5rem' }}>Syllabus Modules</h3>
            {courseModules.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                <Layers size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
                <h4 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)', margin: 0 }}>
                  No syllabus modules available yet
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.5rem', maxWidth: '480px', marginInline: 'auto' }}>
                  Course modules and study materials published by your instructor will appear here once syllabus sections are configured.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {courseModules.map((mod) => (
                  <div 
                    key={mod.id} 
                    style={{ 
                      padding: '1.25rem', 
                      border: '1px solid rgba(156, 163, 175, 0.2)', 
                      borderRadius: 'var(--border-radius)',
                      backgroundColor: 'var(--brand-light-grey)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {mod.title}
                      </h4>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--brand-dark-grey)' }}>
                        <span>📚 {mod.materialsCount} {mod.materialsCount === 1 ? 'Reading' : 'Readings'}</span>
                        <span>📝 {mod.assignmentsCount} {mod.assignmentsCount === 1 ? 'Assignment' : 'Assignments'}</span>
                      </div>
                    </div>
                    <ProgressBar progress={mod.completion ?? 0} label="Module Completion" />
                    {mod.materials && mod.materials.length > 0 && (
                      <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(156, 163, 175, 0.15)', paddingTop: '0.5rem' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-dark-grey)', marginBottom: '0.25rem' }}>
                          Module Reference Materials:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.825rem' }}>
                          {mod.materials.map(mat => (
                            <li key={mat.id} style={{ marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 500 }}>{mat.title}</span> ({mat.fileName})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MATERIALS PANEL */}
        {activeTab === 'materials' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>Reference Materials</h3>
            {courseMaterials.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                <FileText size={32} style={{ margin: '0 auto 0.5rem', color: '#94A3B8' }} />
                <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--brand-black)', margin: 0 }}>No course materials uploaded yet</p>
                <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>Materials uploaded by faculty will appear here for secure download.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Material Title</th>
                      <th>Module</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseMaterials.map((mat) => (
                      <tr key={mat.id}>
                        <td><strong>{mat.title}</strong></td>
                        <td>{mat.moduleId}</td>
                        <td className="font-mono" style={{ fontSize: '0.85rem' }}>{mat.fileName}</td>
                        <td style={{ fontSize: '0.85rem', color: '#64748B' }}>
                          {mat.fileSize ? `${(mat.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'N/A'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {mat.storagePath ? (
                            <button 
                              className="btn btn-secondary" 
                              style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} 
                              onClick={async () => {
                                try {
                                  await downloadCourseMaterial(mat.storagePath!, mat.fileName);
                                } catch (err: any) {
                                  alert('Download error: ' + (err.message || 'Unknown error'));
                                }
                              }}
                            >
                              <FolderDown size={14} /> Download
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No file</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ASSIGNMENTS PANEL */}
        {activeTab === 'assignments' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>Course Assignments</h3>
            {courseAssignments.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)' }}>No assignments recorded for this course.</p>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Deadline</th>
                      <th>Marks</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseAssignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.title.split(' — ')[1] || a.title}</strong>
                        </td>
                        <td>{new Date(a.deadline).toLocaleDateString()} at {new Date(a.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{a.marks} Marks</td>
                        <td>
                          <span className={`badge badge-${a.status.toLowerCase()}`}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link 
                            to={`/student/assignments/${a.id}`} 
                            className="btn btn-secondary"
                            style={{ display: 'inline-flex', width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ASSESSMENTS PANEL */}
        {activeTab === 'assessments' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>Course Assessments</h3>
            {courseAssessments.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)' }}>No assessments recorded for this course.</p>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date / Time</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseAssessments.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.title}</strong></td>
                        <td>{a.date} at {a.time}</td>
                        <td>{a.duration} mins</td>
                        <td>
                          <span className={`badge badge-${a.status.toLowerCase()}`}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link 
                            to={`/student/assessments/${a.id}`} 
                            className="btn btn-secondary"
                            style={{ display: 'inline-flex', width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ANNOUNCEMENTS PANEL */}
        {activeTab === 'announcements' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.75rem' }}>Announcements</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ border: '1px solid rgba(156, 163, 175, 0.2)', padding: '1rem', borderRadius: 'var(--border-radius)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--brand-orange)', marginBottom: '0.25rem' }}>
                  <Megaphone size={16} />
                  <strong style={{ fontSize: '0.875rem' }}>Clarification on Coursework & Syllabus</strong>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--brand-black)' }}>
                  "For questions regarding assignments and upcoming assessments, refer to the published reference materials and syllabus modules or contact faculty during scheduled office hours."
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Posted by {facultyDisplayName}</span>
              </div>
            </div>
          </div>
        )}

        {/* PROGRESS PANEL */}
        {activeTab === 'progress' && (
          <div className="dashboard-panel">
            <h3 className="panel-title" style={{ marginBottom: '0.5rem' }}>Academic Performance Summary</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginBottom: '1rem' }}>
              Grade summaries for course work, quizzes, and internal tests.
            </p>
            {gradedItems.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
                <p style={{ fontSize: '0.9rem', margin: 0 }}>No graded coursework recorded for this course yet.</p>
                <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>
                  Scores will appear here as your assignments and assessments are evaluated.
                </p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item Type</th>
                      <th>Name</th>
                      <th>Grade / Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradedItems.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.type}</td>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.scoreDisplay}</td>
                        <td>
                          <span className={`badge badge-${item.status.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </AppShell>
  );
};
export default CourseDetail;
