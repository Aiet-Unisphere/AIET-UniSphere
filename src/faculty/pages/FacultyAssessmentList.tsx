import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Plus, Search, Filter, Clock, CheckCircle2, AlertCircle, Eye, Trash2 } from 'lucide-react';
import { FacultyAppShell } from '../components/FacultyAppShell';
import { StatCard } from '../../components/StatCard';
import { getFacultyAssessments, deleteAssessment } from '../../services/assessmentService';
import type { Assessment } from '../../data/assessments';
import { CreateAssessmentModal } from '../components/CreateAssessmentModal';

export const FacultyAssessmentList: React.FC = () => {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [activeTab, setActiveTab] = useState<'All' | 'Upcoming' | 'Active' | 'Completed' | 'Graded'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getFacultyAssessments();
      setAssessments(data);
    } catch (err) {
      console.error("Error loading faculty assessments:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteAssessment = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) return;
    try {
      await deleteAssessment(id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to delete assessment.');
    }
  };

  const upcomingCount = assessments.filter(a => a.status === 'Upcoming' || a.status === 'Active').length;
  const completedCount = assessments.filter(a => a.status === 'Completed' || a.status === 'Graded').length;
  const pendingEvalCount = assessments.filter(a => a.status === 'Completed').length;

  const filteredAssessments = assessments.filter(a => {
    const code = a.courseCode || a.courseId || a.subjectCode || '';
    const matchesSearch = 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.courseName || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'All') return matchesSearch;
    return matchesSearch && a.status === activeTab;
  });

  return (
    <FacultyAppShell>
      {/* Page Title Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand-black)' }}>
            Assessment Management
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', fontWeight: 500, marginTop: '0.2rem' }}>
            Schedule tests, administer online quizzes, review student results, and record internal examination marks.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} />
          <span>Create Assessment</span>
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="UPCOMING TESTS"
          value={upcomingCount}
          subtitle="Scheduled Exams & Quizzes"
          icon={<Clock size={22} />}
        />
        <StatCard
          title="COMPLETED EXAMS"
          value={completedCount}
          subtitle="Conducted Tests"
          icon={<CheckCircle2 size={22} />}
        />
        <StatCard
          title="PENDING EVALUATION"
          value={pendingEvalCount}
          subtitle="Submissions Awaiting Grading"
          icon={<AlertCircle size={22} />}
        />
        <StatCard
          title="TOTAL ASSESSMENTS"
          value={assessments.length}
          subtitle="Coursework Tests Created"
          icon={<Award size={22} />}
        />
      </div>

      {/* Tabs & Search Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['All', 'Upcoming', 'Active', 'Completed', 'Graded'] as const).map(tab => (
              <button
                key={tab}
                className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tab}</span>
              </button>
            ))}
          </div>

          <div className="header-search" style={{ minWidth: '240px', width: 'auto' }}>
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search assessments, subject code..."
              className="header-search-input"
              style={{ width: '100%' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table / List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--brand-dark-grey)', fontWeight: 500 }}>
          Loading assessments...
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Award size={40} style={{ color: 'var(--brand-dark-grey)', margin: '0 auto 0.75rem auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No Assessments Found</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
            There are no test assessments created yet. Click "Create Assessment" to schedule a new test for your students.
          </p>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1.25rem', width: 'auto', marginInline: 'auto' }}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            <span>Create Assessment</span>
          </button>
        </div>
      ) : (
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Subject Code & Assessment Title</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Semester</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Date & Time</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Duration</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Total Marks</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((a) => {
                  const subjectCodeDisplay = a.courseCode || a.courseId || a.subjectCode || 'N/A';
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <span className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{subjectCodeDisplay}</span>
                        <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.1rem', fontSize: '0.9rem' }}>{a.title}</div>
                        {a.courseName && a.courseName !== subjectCodeDisplay && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{a.courseName}</div>
                        )}
                      </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="badge badge-graded font-mono">SEM {a.semester || 6}</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div className="font-mono" style={{ fontSize: '0.825rem', fontWeight: 600 }}>{a.date || a.dueDate}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{a.time}</div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }} className="font-mono font-bold">
                      {a.duration || a.durationMinutes} Mins
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }} className="font-mono font-bold">
                      {a.totalMarks || 50} Marks
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${a.status === 'Graded' || a.status === 'Completed' ? 'badge-active' : a.status === 'Active' ? 'badge-pending' : 'badge-overdue'}`}>
                        {a.status}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => navigate(`/faculty/assessments/${a.id}`)}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                        >
                          <Eye size={14} />
                          <span>Inspect</span>
                        </button>
                        {(a.status === 'Draft' || a.status === 'Upcoming') && (
                          <button
                            onClick={() => handleDeleteAssessment(a.id, a.title)}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', color: '#b91c1c' }}
                            title="Delete Assessment"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <CreateAssessmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadData}
      />
    </FacultyAppShell>
  );
};

export default FacultyAssessmentList;
