import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Award, Calendar, Clock, Eye, CheckCircle2, AlertCircle } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { StatCard } from '../../components/StatCard';
import { getDepartmentAssessments } from '../../services/assessmentService';
import type { Assessment } from '../../data/assessments';
import { useAuth } from '../../app/context/AuthContext';

export const HODAssessmentList: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [semFilter, setSemFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAssessments = async () => {
      setLoading(true);
      try {
        const data = await getDepartmentAssessments();
        setAssessments(data);
      } catch (err) {
        console.error("Error loading department assessments:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAssessments();
  }, []);

  const upcomingCount = assessments.filter(a => a.status === 'Upcoming' || a.status === 'Active').length;
  const completedCount = assessments.filter(a => a.status === 'Completed' || a.status === 'Graded').length;
  const pendingEvalCount = assessments.filter(a => a.status === 'Completed').length;

  const filteredAssessments = assessments.filter((a) => {
    const matchesSearch = 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.courseCode || a.courseId).toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.courseName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSem = semFilter === 'All' || a.semester === Number(semFilter);
    const matchesStatus = statusFilter === 'All' || a.status === statusFilter;

    return matchesSearch && matchesSem && matchesStatus;
  });

  return (
    <HODAppShell>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono font-bold">ACADEMIC GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Department Assessment Overview
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            {profile?.department?.name || 'Department'} examinations, quizzes and evaluations
          </p>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="UPCOMING ASSESSMENTS"
          value={upcomingCount}
          subtitle="Scheduled Exams & Quizzes"
          icon={<Clock size={22} />}
        />
        <StatCard
          title="COMPLETED EXAMS"
          value={completedCount}
          subtitle="Conducted Assessments"
          icon={<CheckCircle2 size={22} />}
        />
        <StatCard
          title="PENDING EVALUATION"
          value={pendingEvalCount}
          subtitle="Faculty Grading Progress"
          icon={<AlertCircle size={22} />}
        />
        <StatCard
          title="DEPT AVERAGE"
          value="82.4%"
          subtitle="Across All Conducted Exams"
          icon={<Award size={22} />}
        />
      </div>

      {/* Filters & Search */}
      <div className="dashboard-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="header-search" style={{ width: '300px', position: 'relative' }}>
            <Search size={16} className="header-search-icon" />
            <input 
              type="text" 
              placeholder="Search assessment, course..."
              className="header-search-input font-sans"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', color: 'var(--brand-dark-grey)', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Filter By:</span>
            </div>

            <select 
              className="form-select font-sans"
              style={{ width: '140px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={semFilter}
              onChange={(e) => setSemFilter(e.target.value)}
            >
              <option value="All">All Semesters</option>
              <option value="3">Semester 3</option>
              <option value="4">Semester 4</option>
              <option value="5">Semester 5</option>
              <option value="6">Semester 6</option>
            </select>

            <select 
              className="form-select font-sans"
              style={{ width: '150px', padding: '0.45rem 0.75rem', fontSize: '0.825rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Graded">Graded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            Loading Assessments...
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--brand-dark-grey)' }}>
            <Award size={36} style={{ margin: '0 auto 0.75rem', color: '#94A3B8' }} />
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--brand-black)' }}>No assessments found</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Assessment Title & Course</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Faculty In-Charge</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Semester</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Date & Duration</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Total Marks</th>
                  <th style={{ padding: '1rem 1.25rem' }}>Status</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="font-mono text-blue font-bold" style={{ fontSize: '0.825rem' }}>{a.courseCode}</span>
                      <div style={{ fontWeight: 700, color: 'var(--brand-black)', marginTop: '0.1rem', fontSize: '0.9rem' }}>{a.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{a.courseName}</div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--brand-black)' }}>
                      Not recorded
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className="badge badge-graded font-mono">SEM {a.semester}</span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <div className="font-mono" style={{ fontSize: '0.825rem', fontWeight: 600 }}>{a.dueDate}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>{a.durationMinutes} Mins</div>
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }} className="font-mono font-bold">
                      {a.totalMarks} Marks
                    </td>

                    <td style={{ padding: '1rem 1.25rem' }}>
                      <span className={`badge ${a.status === 'Graded' || a.status === 'Completed' ? 'badge-active' : a.status === 'Active' ? 'badge-pending' : 'badge-overdue'}`}>
                        {a.status}
                      </span>
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <button 
                        onClick={() => navigate(`/hod/assessments/${a.id}`)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      >
                        <Eye size={14} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </HODAppShell>
  );
};

export default HODAssessmentList;
