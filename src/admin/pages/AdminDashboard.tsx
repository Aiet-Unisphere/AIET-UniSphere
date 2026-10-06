import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, ShieldCheck, Building2, UserPlus, Lock, Clock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { AdminAppShell } from '../components/AdminAppShell';
import { StatCard } from '../../components/StatCard';
import { getUsers } from '../../services/userService';
import { getAuditLogs } from '../../services/auditService';
import { getDepartmentSummaries, type DepartmentSummary } from '../../services/departmentService';
import type { User } from '../../shared/types/user';
import type { AuditLogEvent } from '../../services/auditService';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [usersData, logsData, departmentData] = await Promise.all([
          getUsers(),
          getAuditLogs(),
          getDepartmentSummaries()
        ]);
        setUsers(usersData);
        setAuditLogs(logsData);
        setDepartments(departmentData);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load admin dashboard data.');
        console.error("Error loading admin dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  const totalCount = users.length;
  const studentCount = users.filter(u => u.role === 'STUDENT').length;
  const facultyCount = users.filter(u => u.role === 'FACULTY').length;
  const hodCount = users.filter(u => u.role === 'HOD').length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  const activeCount = users.filter(u => u.status === 'Active').length;
  const inactiveCount = users.filter(u => u.status === 'Inactive').length;
  const lockedCount = users.filter(u => u.status === 'Locked').length;
  const pendingCount = users.filter(u => u.status === 'Pending').length;

  return (
    <AdminAppShell>
      {/* Header Banner & Quick Actions */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono" style={{ backgroundColor: 'var(--brand-black)', color: '#FFF' }}>SYSTEM GOVERNANCE</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Institution User & Access Control
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            AIET-UniSphere User Lifecycle, Role Assignment & Security Overview
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate('/admin/users/create')}
            className="btn btn-primary font-sans"
          >
            <UserPlus size={16} />
            <span>Add User</span>
          </button>
          <button 
            onClick={() => navigate('/admin/users')}
            className="btn btn-secondary font-sans"
          >
            <Users size={16} />
            <span>Manage Users</span>
          </button>
        </div>
      </div>

      {/* Primary User Stat Cards */}
      <div className="stat-cards-grid" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          title="TOTAL USERS"
          value={totalCount}
          subtitle="Institution Accounts"
          icon={<Users size={22} />}
        />
        <StatCard
          title="STUDENTS"
          value={studentCount}
          subtitle="Enrolled Learners"
          icon={<UserCheck size={22} />}
        />
        <StatCard
          title="FACULTY"
          value={facultyCount}
          subtitle="Teaching Instructors"
          icon={<UserCheck size={22} />}
        />
        <StatCard
          title="HODS & ADMINS"
          value={hodCount + adminCount}
          subtitle="Department Heads & Admins"
          icon={<ShieldCheck size={22} />}
        />
      </div>

      {/* Account Status Grid Panel */}
      <div className="dashboard-panel" style={{ marginBottom: '1.75rem' }}>
        <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Account Status Overview</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>ACTIVE ACCOUNTS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.2rem' }} className="font-mono">{activeCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>Normal Portal Access</div>
          </div>

          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>INACTIVE ACCOUNTS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-orange)', marginTop: '0.2rem' }} className="font-mono">{inactiveCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>Deactivated Access</div>
          </div>

          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>LOCKED ACCOUNTS</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-error)', marginTop: '0.2rem' }} className="font-mono">{lockedCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>Security Lock</div>
          </div>

          <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem 1.25rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(156, 163, 175, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>PENDING PROFILES</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-blue)', marginTop: '0.2rem' }} className="font-mono">{pendingCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>Awaiting First Login</div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Section: Departments & Audit Log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* Department Roster Table */}
        <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="panel-title font-display" style={{ margin: 0 }}>Institution Departments</h2>
            <button onClick={() => navigate('/admin/organization')} className="btn-link font-sans" style={{ fontSize: '0.8rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>Manage All</span> <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Department Name</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>HOD</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Faculty</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Students</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <tr><td colSpan={5} style={{ padding: '1rem', color: 'var(--color-error)' }}>{loadError}</td></tr>
                ) : loading ? (
                  <tr><td colSpan={5} style={{ padding: '1rem' }}>Loading department data...</td></tr>
                ) : departments.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '1rem' }}>No departments are registered.</td></tr>
                ) : departments.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span className="font-mono text-blue font-bold">{d.code || '—'}</span>
                      <div style={{ fontWeight: 700, color: 'var(--brand-black)' }}>{d.name}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600 }}>{d.hodName}</td>
                    <td style={{ padding: '0.85rem 1.25rem' }} className="font-mono font-bold">{d.activeFacultyCount} / {d.facultyCount}</td>
                    <td style={{ padding: '0.85rem 1.25rem' }} className="font-mono font-bold">{d.activeStudentCount} / {d.studentCount}</td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      <span className={`badge ${d.status === 'ACTIVE' ? 'badge-active' : 'badge-overdue'}`}>{d.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Admin Activity Feed */}
        <div className="dashboard-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 className="panel-title font-display" style={{ margin: 0 }}>Recent Admin Activity</h2>
            <button onClick={() => navigate('/admin/security')} className="btn-link font-sans" style={{ fontSize: '0.8rem', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--brand-blue)' }}>
              View Audit Log
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {auditLogs.slice(0, 5).map((log) => (
              <div 
                key={log.id} 
                style={{ 
                  padding: '0.75rem 0.85rem', 
                  backgroundColor: 'var(--brand-light-grey)', 
                  borderRadius: 'var(--border-radius)', 
                  border: '1px solid rgba(156, 163, 175, 0.2)',
                  fontSize: '0.825rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>{log.action.replace('_', ' ')}</span>
                  <span style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>{new Date(log.created_at).toLocaleString()}</span>
                </div>

                <div style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                  {log.entity_type}{log.entity_id ? <>: <span className="font-mono text-blue">{log.entity_id}</span></> : ''}
                </div>

                {log.metadata && (
                  <div style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', marginTop: '0.15rem' }}>
                    {log.description || (log.metadata ? JSON.stringify(log.metadata) : '')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminAppShell>
  );
};

export default AdminDashboard;
