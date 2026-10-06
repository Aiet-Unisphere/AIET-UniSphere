import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, Users, CheckCircle2, Clock, Calendar, BarChart2 } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { getAssessmentById, getAssessmentPerformanceSummary, type AssessmentPerformanceSummary } from '../../services/assessmentService';
import type { Assessment } from '../../data/assessments';

export const HODAssessmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [metrics, setMetrics] = useState<AssessmentPerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetail = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [item, performance] = await Promise.all([
          getAssessmentById(id),
          getAssessmentPerformanceSummary(id),
        ]);
        setAssessment(item || null);
        setMetrics(performance);
      } catch (err) {
        console.error("Error loading assessment detail:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <HODAppShell>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
          Loading Assessment Details...
        </div>
      </HODAppShell>
    );
  }

  if (!assessment) {
    return (
      <HODAppShell>
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Assessment Record Not Found</h2>
          <button onClick={() => navigate('/hod/assessments')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Back to Assessment Overview
          </button>
        </div>
      </HODAppShell>
    );
  }

  return (
    <HODAppShell>
      {/* Back Link & Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button 
          onClick={() => navigate('/hod/assessments')}
          className="btn-link font-sans"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--brand-blue)' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Assessment Overview</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-active font-mono">{assessment.courseCode}</span>
              <span className="badge badge-graded font-mono">SEMESTER {assessment.semester}</span>
            </div>
            <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', margin: 0 }}>
              {assessment.title}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
              Course: <strong>{assessment.courseName}</strong> · Faculty Lead: <strong>Not recorded</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Grid: 4 Metric Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card">
          <span className="stat-title">TOTAL STUDENTS</span>
          <div className="stat-value">{metrics?.enrolledStudents ?? '—'}</div>
          <span className="stat-subtitle">Enrolled in Course</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">ATTEMPTED</span>
          <div className="stat-value text-blue">{metrics?.attemptedStudents ?? '—'}</div>
          <span className="stat-subtitle">Submissions Recorded</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">EVALUATED</span>
          <div className="stat-value text-success">{metrics?.submittedAttempts ?? '—'}</div>
          <span className="stat-subtitle">Graded by Faculty</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">CLASS AVERAGE</span>
          <div className="stat-value text-orange">{metrics?.averagePercentage == null ? 'No submissions' : `${metrics.averagePercentage}%`}</div>
          <span className="stat-subtitle">Performance Rating</span>
        </div>
      </div>

      {/* Assessment Specifications */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
        <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Assessment Specifications</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: '0.875rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DATE & TIME</span>
            <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }} className="font-mono">{assessment.dueDate}</div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>DURATION</span>
            <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.2rem' }}>{assessment.durationMinutes} Minutes</div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>MAXIMUM MARKS</span>
            <div style={{ fontWeight: 800, color: 'var(--brand-blue)', marginTop: '0.2rem' }} className="font-mono">{assessment.totalMarks} Marks</div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>STATUS</span>
            <div style={{ marginTop: '0.2rem' }}>
              <span className="badge badge-active">{assessment.status}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>INSTRUCTIONS / SYLLABUS COVERAGE</span>
          <div style={{ padding: '0.85rem', backgroundColor: 'var(--brand-light-grey)', borderRadius: 'var(--border-radius)', fontSize: '0.9rem', color: 'var(--brand-black)', lineHeight: 1.5 }}>
            {assessment.instructions || "Standard departmental examination covering Modules 1, 2, and 3. Includes mandatory technical problem solving and algorithm analysis."}
          </div>
        </div>
      </div>
    </HODAppShell>
  );
};

export default HODAssessmentDetail;
