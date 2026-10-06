import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  KeyRound, 
  FileText, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  UserCheck,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { AdminAppShell } from '../components/AdminAppShell';
import { getAuditLogs } from '../../services/auditService';
import { getUsers, resetUserPassword, lockUser, unlockUser } from '../../services/userService';
import type { AuditLogEvent } from '../../services/auditService';
import type { User } from '../../shared/types/user';

export const SecurityPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Audit Filters
  const [actionFilter, setActionFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected User for Security Actions
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const [logs, uList] = await Promise.all([
        getAuditLogs(),
        getUsers()
      ]);
      setAuditLogs(logs);
      setUsers(uList);
      if (uList.length > 0 && !selectedUser) {
        setSelectedUser(uList[0]);
      }
    } catch (err) {
      console.error("Error loading security data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    const res = await resetUserPassword(selectedUser.id);
    if (res) {
      setActionNotice(`Administrative password reset requested for ${selectedUser.name}.`);
      fetchSecurityData();
    }
  };

  const handleToggleLock = async () => {
    if (!selectedUser) return;
    if (selectedUser.status === 'Locked') {
      const u = await unlockUser(selectedUser.id);
      if (u) { setSelectedUser(u); setActionNotice(`Security lock removed from ${selectedUser.name}.`); }
    } else {
      const u = await lockUser(selectedUser.id);
      if (u) { setSelectedUser(u); setActionNotice(`Security lock applied to ${selectedUser.name}.`); }
    }
    fetchSecurityData();
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesAction = actionFilter === 'All' || log.action === actionFilter;
    const normalizedSearch = searchQuery.toLowerCase();
    const matchesQuery = !searchQuery ||
      (log.actor_email || '').toLowerCase().includes(normalizedSearch) ||
      (log.actor_id || '').toLowerCase().includes(normalizedSearch) ||
      (log.entity_type || '').toLowerCase().includes(normalizedSearch) ||
      (log.entity_id || '').toLowerCase().includes(normalizedSearch);
    return matchesAction && matchesQuery;
  });

  return (
    <AdminAppShell>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-active font-mono" style={{ backgroundColor: 'var(--brand-black)', color: '#FFF' }}>SYSTEM ACCESS & AUDIT</span>
          <h1 className="font-display" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--brand-black)', marginTop: '0.25rem', marginBottom: 0 }}>
            Account Access & Security Audit
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--brand-dark-grey)', marginTop: '0.2rem' }}>
            Credential Status, Account Locking Governance & Immutable System Audit Logs
          </p>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionNotice && (
        <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', padding: '0.85rem 1.25rem', borderRadius: 'var(--border-radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{actionNotice}</span>
          </div>
        </div>
      )}

      {/* Security Actions Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        
        {/* User Picker Panel */}
        <div className="dashboard-panel">
          <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Select User for Security Operations</h2>

          <div style={{ marginBottom: '1rem' }}>
            <select 
              className="form-select font-sans"
              value={selectedUser?.id || ''}
              onChange={(e) => {
                const u = users.find(x => x.id === e.target.value);
                if (u) setSelectedUser(u);
              }}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.userId}) — {u.role}
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <div style={{ backgroundColor: 'var(--brand-light-grey)', padding: '1rem', borderRadius: 'var(--border-radius)', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--brand-black)' }}>{selectedUser.name}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>
                ID: <span className="font-mono text-blue font-bold">{selectedUser.userId}</span> · {selectedUser.email}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <span className="badge badge-active font-mono font-bold" style={{ backgroundColor: 'var(--brand-black)', color: '#FFF' }}>{selectedUser.role}</span>
                <span className={`badge ${selectedUser.status === 'Active' ? 'badge-active' : selectedUser.status === 'Locked' ? 'badge-error' : 'badge-pending'}`}>
                  {selectedUser.status}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Security Controls & Password Management */}
        <div className="dashboard-panel">
          <h2 className="panel-title font-display" style={{ marginBottom: '1rem' }}>Password & Access Management</h2>

          {selectedUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                <div style={{ border: '1px solid rgba(156, 163, 175, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)' }}>
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>PASSWORD MASK</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.2rem' }} className="font-mono">••••••••••</div>
                </div>

                <div style={{ border: '1px solid rgba(156, 163, 175, 0.2)', padding: '0.75rem', borderRadius: 'var(--border-radius)' }}>
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--brand-dark-grey)', textTransform: 'uppercase' }}>PASSWORD STATUS</span>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--brand-orange)', marginTop: '0.2rem' }} className="font-mono">
                    {selectedUser.passwordStatus || 'Set'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <button 
                  onClick={handleResetPassword}
                  className="btn btn-secondary font-sans"
                >
                  <KeyRound size={16} />
                  <span>Force Password Reset</span>
                </button>

                <button 
                  onClick={handleToggleLock}
                  className="btn btn-secondary font-sans"
                  style={{ color: selectedUser.status === 'Locked' ? 'var(--color-success)' : 'var(--color-error)' }}
                >
                  {selectedUser.status === 'Locked' ? <Unlock size={16} /> : <Lock size={16} />}
                  <span>{selectedUser.status === 'Locked' ? 'Unlock Account' : 'Lock Account'}</span>
                </button>
              </div>

            </div>
          ) : (
            <div style={{ color: 'var(--brand-dark-grey)', fontSize: '0.9rem' }}>Select a user to inspect security status.</div>
          )}
        </div>

      </div>

      {/* Main Audit Log Table Panel */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="panel-title font-display" style={{ margin: 0 }}>System Administrative Audit Log</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-dark-grey)', marginTop: '0.1rem' }}>Immutable record of all administrative state changes</p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--brand-dark-grey)' }} />
              <input 
                type="text"
                placeholder="Search actor or target..."
                className="form-input font-sans"
                style={{ paddingLeft: '2.1rem', fontSize: '0.8rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select 
              className="form-select font-sans"
              style={{ width: '180px', fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="All">All Audit Actions</option>
              <option value="USER_CREATED">USER CREATED</option>
              <option value="USER_UPDATED">USER UPDATED</option>
              <option value="ROLE_CHANGED">ROLE CHANGED</option>
              <option value="ACCOUNT_DEACTIVATED">ACCOUNT DEACTIVATED</option>
              <option value="ACCOUNT_REACTIVATED">ACCOUNT REACTIVATED</option>
              <option value="ACCOUNT_LOCKED">ACCOUNT LOCKED</option>
              <option value="PASSWORD_RESET_REQUESTED">PASSWORD RESET REQUESTED</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>
                <th style={{ padding: '0.85rem 1.25rem' }}>Audit Event & Action</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Entity</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Actor</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Event Metadata</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <span className="badge badge-active font-mono font-bold" style={{ fontSize: '0.725rem' }}>
                      {log.action}
                    </span>
                  </td>

                  <td style={{ padding: '0.85rem 1.25rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--brand-black)' }}>{log.entity_type}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>ID: <span className="font-mono text-blue">{log.entity_id || '—'}</span></div>
                  </td>

                  <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600 }}>
                    {log.actor_email || 'Unknown actor'}{log.actor_id ? <> (<span className="font-mono text-blue">{log.actor_id}</span>)</> : ''}
                  </td>

                  <td style={{ padding: '0.85rem 1.25rem', color: 'var(--brand-dark-grey)', fontSize: '0.8rem' }}>
                    {log.description || (log.metadata ? JSON.stringify(log.metadata) : '—')}
                  </td>

                  <td style={{ padding: '0.85rem 1.25rem' }} className="font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminAppShell>
  );
};

export default SecurityPage;
