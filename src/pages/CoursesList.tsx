import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, ExternalLink, RefreshCw, Award, Filter } from 'lucide-react';
import { getCourses } from '../services/courseService';
import { getStudentProfile } from '../services/studentService';
import {
  getMyExternalLearningItems,
  getEvidenceSignedUrl,
  type StudentExternalLearningItem
} from '../services/externalLearningService';
import { AppShell } from '../components/AppShell';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ExternalLearningCourseCard } from '../components/ExternalLearningCourseCard';
import { ExternalCourseDetailModal } from '../components/ExternalCourseDetailModal';
import { ExternalCourseProgressModal } from '../components/ExternalCourseProgressModal';
import { ExternalCourseEvidenceModal } from '../components/ExternalCourseEvidenceModal';

export const CoursesList: React.FC = () => {
  const navigate = useNavigate();

  // Mode Switcher: 'academic' (default) | 'external'
  const [activeTab, setActiveTab] = useState<'academic' | 'external'>('academic');

  // Academic Courses state
  const [courses, setCourses] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isAcademicLoading, setIsAcademicLoading] = useState(true);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string>('all');

  // External Learning state
  const [externalItems, setExternalItems] = useState<StudentExternalLearningItem[]>([]);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalPlatformFilter, setExternalPlatformFilter] = useState<string>('all');
  const [externalStatusFilter, setExternalStatusFilter] = useState<string>('all');

  // Modals state
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<StudentExternalLearningItem | null>(null);
  const [selectedItemForProgress, setSelectedItemForProgress] = useState<StudentExternalLearningItem | null>(null);
  const [selectedItemForEvidence, setSelectedItemForEvidence] = useState<StudentExternalLearningItem | null>(null);

  // Fetch Academic Courses
  const fetchAcademicData = async () => {
    setIsAcademicLoading(true);
    setAcademicError(null);
    try {
      const [coursesData, profileData] = await Promise.all([
        getCourses(),
        getStudentProfile()
      ]);
      setCourses(coursesData);
      setProfile(profileData);
    } catch (err) {
      setAcademicError("Unable to load your courses. Please try again.");
    } finally {
      setIsAcademicLoading(false);
    }
  };

  // Fetch External Learning
  const fetchExternalData = async () => {
    setIsExternalLoading(true);
    setExternalError(null);
    try {
      const items = await getMyExternalLearningItems();
      setExternalItems(items);
    } catch (err) {
      setExternalError("Unable to load your external learning courses. Please try again.");
    } finally {
      setIsExternalLoading(false);
    }
  };

  useEffect(() => {
    fetchAcademicData();
  }, []);

  useEffect(() => {
    if (activeTab === 'external') {
      fetchExternalData();
    }
  }, [activeTab]);

  // View Certificate Signed URL handler
  const handleViewCertificate = async (storagePath: string) => {
    try {
      const signedUrl = await getEvidenceSignedUrl(storagePath);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err.message || 'Unable to open certificate document.');
    }
  };

  // Filter academic courses
  const filteredAcademicCourses = courses.filter((course) => {
    const matchesSearch = 
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      course.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (course.faculty && course.faculty.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesSemester = 
      selectedSemester === 'all' || 
      course.semester?.toString() === selectedSemester;

    return matchesSearch && matchesSemester;
  });

  // Filter external learning items
  const filteredExternalItems = externalItems.filter((item) => {
    const matchesSearch = 
      item.course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.course.platform && item.course.platform.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.assignment.academic_course_id && item.assignment.academic_course_id.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPlatform = 
      externalPlatformFilter === 'all' ||
      item.course.platform.toLowerCase() === externalPlatformFilter.toLowerCase();

    const matchesStatus =
      externalStatusFilter === 'all' ||
      item.enrollment.status.toLowerCase() === externalStatusFilter.toLowerCase();

    return matchesSearch && matchesPlatform && matchesStatus;
  });

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header-container" style={{ marginBottom: '1.25rem' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Courses</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>My Courses</h1>
          {profile && (
            <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
              {profile.department} · Current Semester: {profile.semester}
            </p>
          )}
        </div>

        {/* Top Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderBottom: '2px solid #E5E7EB' }}>
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
            Academic Subjects
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
          </button>
        </div>
      </div>

      {/* Mode 1: Academic Subjects */}
      {activeTab === 'academic' && (
        <>
          {isAcademicLoading ? (
            <LoadingState message="Loading your academic courses..." />
          ) : academicError ? (
            <ErrorState message={academicError} onRetry={fetchAcademicData} />
          ) : (
            <>
              {/* Filter and Search controls */}
              <div className="filter-bar">
                <div className="header-search" style={{ display: 'flex', width: '320px', maxWidth: '100%' }}>
                  <Search size={16} className="header-search-icon" />
                  <input 
                    type="text" 
                    className="header-search-input" 
                    placeholder="Search by course name, code, faculty..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search academic courses"
                    style={{ display: 'block' }}
                  />
                </div>

                <div className="filter-controls-group">
                  <label htmlFor="semester-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                    Semester:
                  </label>
                  <select 
                    id="semester-filter"
                    className="filter-select"
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                  >
                    <option value="all">All Semesters</option>
                    <option value="7">Semester 7</option>
                    <option value="6">Semester 6</option>
                    <option value="5">Semester 5</option>
                  </select>
                </div>
              </div>

              {filteredAcademicCourses.length === 0 ? (
                <EmptyState 
                  title="No courses found" 
                  message={searchQuery ? `We couldn't find any courses matching "${searchQuery}".` : "No courses are enrolled in this semester."}
                  actionLabel="Clear Filters"
                  onAction={() => { setSearchQuery(''); setSelectedSemester('all'); }}
                />
              ) : (
                <div className="courses-grid">
                  {filteredAcademicCourses.map((course) => (
                    <div key={course.id} className="course-card">
                      <div className="course-card-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="course-code-badge">{course.code}</span>
                          <span 
                            className={`badge ${course.attendance < 80 ? 'badge-overdue' : 'badge-graded'}`}
                            style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
                          >
                            Attendance: {course.attendance || 100}%
                          </span>
                        </div>
                        <h3 className="course-card-title" style={{ marginTop: '0.5rem' }}>{course.name}</h3>
                        <span className="course-card-faculty">Instructor: {course.facultyName || course.faculty || 'Assigned Faculty'}</span>
                      </div>

                      <div className="course-card-metrics">
                        <ProgressBar progress={course.progress || 0} label="Syllabus Completion" />
                      </div>

                      <button 
                        onClick={() => navigate(`/student/courses/${course.id}`)}
                        className="btn btn-primary"
                        style={{ marginTop: '0.5rem' }}
                      >
                        <BookOpen size={16} />
                        Open Course
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Mode 2: External Learning */}
      {activeTab === 'external' && (
        <>
          {isExternalLoading ? (
            <LoadingState message="Loading assigned external learning courses..." />
          ) : externalError ? (
            <ErrorState message={externalError} onRetry={fetchExternalData} />
          ) : (
            <>
              {/* External Filters */}
              <div className="filter-bar">
                <div className="header-search" style={{ display: 'flex', width: '320px', maxWidth: '100%' }}>
                  <Search size={16} className="header-search-icon" />
                  <input 
                    type="text" 
                    className="header-search-input" 
                    placeholder="Search by external course title, platform, code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search external courses"
                    style={{ display: 'block' }}
                  />
                </div>

                <div className="filter-controls-group">
                  <label htmlFor="platform-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                    Platform:
                  </label>
                  <select 
                    id="platform-filter"
                    className="filter-select"
                    value={externalPlatformFilter}
                    onChange={(e) => setExternalPlatformFilter(e.target.value)}
                  >
                    <option value="all">All Platforms</option>
                    <option value="coursera">Coursera</option>
                    <option value="nptel">NPTEL</option>
                    <option value="swayam">SWAYAM</option>
                    <option value="edx">edX</option>
                    <option value="udemy">Udemy</option>
                  </select>

                  <label htmlFor="status-filter" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-black)', marginLeft: '0.5rem' }}>
                    Status:
                  </label>
                  <select 
                    id="status-filter"
                    className="filter-select"
                    value={externalStatusFilter}
                    onChange={(e) => setExternalStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              {/* External Grid / Empty State */}
              {filteredExternalItems.length === 0 ? (
                <EmptyState 
                  title="No external learning courses found" 
                  message={
                    searchQuery || externalPlatformFilter !== 'all' || externalStatusFilter !== 'all'
                      ? "No external courses match your selected filter criteria."
                      : "No external learning courses have been assigned to you yet."
                  }
                  actionLabel={searchQuery || externalPlatformFilter !== 'all' || externalStatusFilter !== 'all' ? "Clear Filters" : undefined}
                  onAction={() => { setSearchQuery(''); setExternalPlatformFilter('all'); setExternalStatusFilter('all'); }}
                />
              ) : (
                <div className="courses-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {filteredExternalItems.map((item) => (
                    <ExternalLearningCourseCard
                      key={item.enrollment.id}
                      item={item}
                      onOpenDetails={(selected) => setSelectedItemForDetails(selected)}
                      onOpenProgressModal={(selected) => setSelectedItemForProgress(selected)}
                      onOpenEvidenceModal={(selected) => setSelectedItemForEvidence(selected)}
                      onViewCertificate={handleViewCertificate}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modals */}
      <ExternalCourseDetailModal
        item={selectedItemForDetails}
        onClose={() => setSelectedItemForDetails(null)}
        onOpenProgressModal={(item) => setSelectedItemForProgress(item)}
        onOpenEvidenceModal={(item) => setSelectedItemForEvidence(item)}
      />

      <ExternalCourseProgressModal
        item={selectedItemForProgress}
        onClose={() => setSelectedItemForProgress(null)}
        onSuccess={fetchExternalData}
      />

      <ExternalCourseEvidenceModal
        item={selectedItemForEvidence}
        onClose={() => setSelectedItemForEvidence(null)}
        onSuccess={fetchExternalData}
      />
    </AppShell>
  );
};

export default CoursesList;
