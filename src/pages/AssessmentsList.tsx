import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Award, HelpCircle, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { getAssessments } from '../services/assessmentService';
import type { Assessment } from '../data/assessments';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

export const AssessmentsList: React.FC = () => {
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active filter: 'all' | 'available' | 'upcoming' | 'completed'
  const [activeTab, setActiveTab] = useState<'all' | 'available' | 'upcoming' | 'completed'>('all');

  const fetchAssessmentsList = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAssessments();
      setAssessments(data);
    } catch (err) {
      setError("Unable to load assessments list. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessmentsList();
  }, []);

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading your assessments..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState message={error} onRetry={fetchAssessmentsList} />
      </AppShell>
    );
  }

  const now = new Date();

  const isAssessmentAvailable = (a: Assessment) => {
    if (a.status === 'Completed' || a.status === 'Closed' || a.status === 'Draft') return false;
    if (a.status === 'Active') return true;
    if (a.availableFrom && a.deadline) {
      const start = new Date(a.availableFrom);
      const end = new Date(a.deadline);
      return now >= start && now <= end;
    }
    return a.status === 'Upcoming';
  };

  const getComputedStatus = (a: Assessment): 'Available' | 'In Progress' | 'Upcoming' | 'Submitted' | 'Expired' | 'Closed' => {
    const attemptStatus = a.studentAttempt?.status;
    if (attemptStatus === 'Submitted' || attemptStatus === 'Graded' || a.status === 'Completed' || a.status === 'Graded') {
      return 'Submitted';
    }
    if (attemptStatus === 'In Progress') {
      return 'In Progress';
    }
    if (a.status === 'Closed' || a.status === 'Draft') return 'Closed';
    if (a.deadline && new Date(a.deadline) < now) return 'Expired';
    if (a.status === 'Active') return 'Available';
    if (a.availableFrom && new Date(a.availableFrom) <= now && (!a.deadline || new Date(a.deadline) >= now)) {
      return 'Available';
    }
    return 'Upcoming';
  };

  const filteredAssessments = assessments.filter(a => {
    const computed = getComputedStatus(a);
    if (activeTab === 'all') return true;
    if (activeTab === 'available') return computed === 'Available';
    if (activeTab === 'upcoming') return computed === 'Upcoming';
    if (activeTab === 'completed') return computed === 'Submitted' || computed === 'In Progress';
    return true;
  });

  const availableCount = assessments.filter(a => getComputedStatus(a) === 'Available').length;
  const upcomingCount = assessments.filter(a => getComputedStatus(a) === 'Upcoming').length;
  const completedCount = assessments.filter(a => getComputedStatus(a) === 'Submitted' || getComputedStatus(a) === 'In Progress').length;

  const formatDateLabel = (isoOrDate?: string) => {
    if (!isoOrDate) return 'N/A';
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return isoOrDate;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="breadcrumbs">
            <span>Academics</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Assessments</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--brand-black)' }}>Course Assessments</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            Take online multiple-choice tests, unit examinations, and review scored results.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="tabs-navigation" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('all')} 
          className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
        >
          All ({assessments.length})
        </button>
        <button 
          onClick={() => setActiveTab('available')} 
          className={`tab-btn ${activeTab === 'available' ? 'active' : ''}`}
        >
          Available Now ({availableCount})
        </button>
        <button 
          onClick={() => setActiveTab('upcoming')} 
          className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
        >
          Upcoming ({upcomingCount})
        </button>
        <button 
          onClick={() => setActiveTab('completed')} 
          className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
        >
          Submitted ({completedCount})
        </button>
      </div>

      {/* Assessment Cards Grid */}
      {filteredAssessments.length === 0 ? (
        <EmptyState 
          title="No assessments found" 
          message={`You do not have any test assessments matching "${activeTab}".`}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem', width: '100%' }}>
          {filteredAssessments.map((a) => {
            const status = getComputedStatus(a);
            const isAvailable = status === 'Available';
            const isInProgress = status === 'In Progress';
            const isSubmitted = status === 'Submitted';
            const isExpired = status === 'Expired';
            const isUpcoming = status === 'Upcoming';

            const badgeLabel = isSubmitted ? 'Attended' : status;

            return (
              <div 
                key={a.id} 
                className="dashboard-panel"
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1.25rem',
                  borderRadius: '10px',
                  border: isAvailable ? '2px solid var(--brand-orange)' : '1px solid rgba(156, 163, 175, 0.2)',
                  boxShadow: isAvailable ? '0 4px 14px rgba(255, 79, 24, 0.12)' : 'none',
                  backgroundColor: '#FFF'
                }}
              >
                <div>
                  {/* Top status & course badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span className="badge badge-active font-mono font-bold" style={{ fontSize: '0.75rem' }}>
                      {a.courseCode || a.courseId || a.subjectCode || 'N/A'}
                    </span>
                    <span 
                      className={`badge ${
                        isAvailable 
                          ? 'badge-active' 
                          : isSubmitted 
                          ? 'badge-graded' 
                          : isExpired 
                          ? 'badge-overdue' 
                          : 'badge-pending'
                      }`}
                      style={{ fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      {badgeLabel}
                    </span>
                  </div>

                  {/* Title & Subject Code */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-black)', lineHeight: 1.35, margin: 0 }}>
                    {a.title}
                  </h3>
                  {a.courseName && a.courseName !== (a.courseCode || a.courseId || a.subjectCode) && (
                    <div style={{ fontSize: '0.825rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
                      {a.courseName}
                    </div>
                  )}

                  {/* Details Grid */}
                  <div 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: '0.75rem', 
                      marginTop: '1rem', 
                      padding: '0.75rem', 
                      backgroundColor: 'var(--brand-light-grey)', 
                      borderRadius: '6px',
                      fontSize: '0.825rem'
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--brand-dark-grey)', display: 'block', fontSize: '0.725rem', textTransform: 'uppercase', fontWeight: 700 }}>
                        QUESTIONS
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                        {a.questionsCount} MCQs
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--brand-dark-grey)', display: 'block', fontSize: '0.725rem', textTransform: 'uppercase', fontWeight: 700 }}>
                        TOTAL MARKS
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--brand-blue)' }}>
                        {a.totalMarks || 50} Marks
                      </span>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--brand-dark-grey)', display: 'block', fontSize: '0.725rem', textTransform: 'uppercase', fontWeight: 700 }}>
                        DURATION
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                        {a.duration || a.durationMinutes} Minutes
                      </span>
                    </div>
                  </div>

                  {/* Schedule info */}
                  <div style={{ marginTop: '0.75rem', fontSize: '0.775rem', color: 'var(--brand-dark-grey)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div>
                      <strong>Available:</strong> {formatDateLabel(a.availableFrom || a.date)}
                    </div>
                    <div>
                      <strong>Deadline:</strong> {formatDateLabel(a.deadline || a.dueDate)}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button */}
                <div style={{ borderTop: '1px solid rgba(156, 163, 175, 0.15)', paddingTop: '0.85rem' }}>
                  {isSubmitted ? (
                    <button
                      onClick={() => navigate(`/student/assessments/${a.id}`)}
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
                    >
                      <CheckCircle2 size={15} />
                      <span>View Result</span>
                    </button>
                  ) : isInProgress ? (
                    <button
                      onClick={() => navigate(`/student/assessments/${a.id}/attempt`)}
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', backgroundColor: 'var(--brand-orange)', fontSize: '0.85rem' }}
                    >
                      <span>Resume Assessment</span>
                      <ArrowRight size={15} />
                    </button>
                  ) : isAvailable ? (
                    <button
                      onClick={() => navigate(`/student/assessments/${a.id}/attempt`)}
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', backgroundColor: 'var(--brand-orange)', fontSize: '0.85rem' }}
                    >
                      <span>Start Assessment</span>
                      <ArrowRight size={15} />
                    </button>
                  ) : isUpcoming ? (
                    <button
                      disabled
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', opacity: 0.6, fontSize: '0.85rem' }}
                    >
                      <Clock size={15} />
                      <span>Opens at {a.time || 'scheduled date'}</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', opacity: 0.6, fontSize: '0.85rem' }}
                    >
                      <AlertCircle size={15} />
                      <span>Assessment Closed</span>
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
};

export default AssessmentsList;
