import React, { useState } from 'react';
import { Search, Filter, ExternalLink } from 'lucide-react';
import type { HODStudentMatrixItem } from '../../services/externalLearningService';
import { getEvidenceSignedUrl } from '../../services/externalLearningService';

interface HODExternalLearningStudentMatrixProps {
  studentMatrix: HODStudentMatrixItem[];
}

export const HODExternalLearningStudentMatrix: React.FC<HODExternalLearningStudentMatrixProps> = ({ studentMatrix }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('All');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [courseFilter, setCourseFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [verificationFilter, setVerificationFilter] = useState('All');

  const uniqueCourses = Array.from(new Set(studentMatrix.map((item) => item.course.title)));
  const uniqueSections = Array.from(new Set(studentMatrix.map((item) => item.assignment.section).filter(Boolean))) as string[];

  const filteredItems = studentMatrix.filter((item) => {
    const studentName = item.studentProfile?.full_name?.toLowerCase() || '';
    const studentUsn = item.studentProfile?.usn_or_employee_id?.toLowerCase() || '';
    const courseTitle = item.course.title.toLowerCase();

    const matchesSearch =
      studentName.includes(searchQuery.toLowerCase()) ||
      studentUsn.includes(searchQuery.toLowerCase()) ||
      courseTitle.includes(searchQuery.toLowerCase());

    const matchesSem = semesterFilter === 'All' || item.assignment.semester?.toString() === semesterFilter;
    const matchesSec = sectionFilter === 'All' || item.assignment.section === sectionFilter;
    const matchesCourse = courseFilter === 'All' || item.course.title === courseFilter;
    const matchesStatus = statusFilter === 'All' || item.enrollment.status === statusFilter;

    let matchesVerification = true;
    if (verificationFilter !== 'All') {
      const vStatus = item.latestEvidence ? item.latestEvidence.verification_status : 'NONE';
      matchesVerification = vStatus === verificationFilter;
    }

    return matchesSearch && matchesSem && matchesSec && matchesCourse && matchesStatus && matchesVerification;
  });

  const handleOpenEvidence = async (path?: string | null, url?: string | null, id?: string | null) => {
    if (path) {
      try {
        const signedUrl = await getEvidenceSignedUrl(path);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch (err: any) {
        alert(err.message || 'Unable to open certificate document.');
      }
    } else if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (id) {
      alert(`Credential ID: ${id}`);
    }
  };

  return (
    <div>
      {/* Filters Bar */}
      <div className="dashboard-panel" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search */}
          <div className="header-search" style={{ flexGrow: 1, minWidth: '240px', maxWidth: '360px' }}>
            <Search size={16} className="header-search-icon" />
            <input
              type="text"
              placeholder="Search student name, USN, or course..."
              className="header-search-input font-sans"
              style={{ width: '100%' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>
              <Filter size={14} />
              <span>Filters:</span>
            </div>

            {/* Semester Filter */}
            <select
              className="form-select font-sans"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
            >
              <option value="All">All Semesters</option>
              <option value="7">Semester 7</option>
              <option value="6">Semester 6</option>
              <option value="5">Semester 5</option>
              <option value="4">Semester 4</option>
              <option value="3">Semester 3</option>
            </select>

            {/* Section Filter */}
            {uniqueSections.length > 0 && (
              <select
                className="form-select font-sans"
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
              >
                <option value="All">All Sections</option>
                {uniqueSections.map((sec) => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))}
              </select>
            )}

            {/* Course Filter */}
            <select
              className="form-select font-sans"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: 'auto', maxWidth: '180px' }}
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="All">All Courses</option>
              {uniqueCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              className="form-select font-sans"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {/* Verification Status Filter */}
            <select
              className="form-select font-sans"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
            >
              <option value="All">All Verifications</option>
              <option value="PENDING">Pending Review</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
              <option value="NONE">No Evidence</option>
            </select>
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="dashboard-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>No student records match the active filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--brand-light-grey)', borderBottom: '1px solid rgba(156, 163, 175, 0.2)', color: 'var(--brand-black)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.725rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Student Name & USN</th>
                  <th style={{ padding: '0.85rem 1rem' }}>External Course</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Sem / Sec</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Reported Progress</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Enrollment Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Evidence Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Deadline / Overdue</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const percent = item.progress?.progress_percent || 0;
                  const vStatus = item.latestEvidence ? item.latestEvidence.verification_status : 'NONE';
                  const is100SelfReported = percent === 100 && item.enrollment.status !== 'COMPLETED';

                  return (
                    <tr key={item.enrollment.id} style={{ borderBottom: '1px solid rgba(156, 163, 175, 0.15)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--brand-black)' }}>
                            {item.studentProfile?.full_name || 'Student'}
                          </div>
                          <div className="font-mono" style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                            {item.studentProfile?.usn_or_employee_id || 'N/A'}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: '#111827', display: 'block' }}>
                            {item.course.title}
                          </span>
                          <span style={{ fontSize: '0.725rem', color: '#6B7280' }}>
                            {item.course.platform}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontWeight: 600 }}>
                          Sem {item.assignment.semester || 'All'} {item.assignment.section ? `(${item.assignment.section})` : ''}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', minWidth: '140px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 700, color: percent === 100 ? '#059669' : '#2563EB' }}>{percent}%</span>
                            {is100SelfReported && (
                              <span style={{ fontSize: '0.675rem', color: '#D97706', fontWeight: 600 }} title="100% reported progress is pending verification before marked complete">
                                100% Reported
                              </span>
                            )}
                          </div>
                          <div style={{ height: '6px', width: '100%', backgroundColor: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${percent}%`, backgroundColor: percent === 100 ? '#059669' : '#2563EB', borderRadius: '3px' }} />
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span className={`badge ${
                          item.enrollment.status === 'COMPLETED' ? 'badge-active' :
                          item.enrollment.status === 'IN_PROGRESS' ? 'badge-graded' :
                          item.enrollment.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-submitted'
                        }`} style={{ fontSize: '0.7rem' }}>
                          {item.enrollment.status}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor:
                            vStatus === 'VERIFIED' ? '#D1FAE5' :
                            vStatus === 'PENDING' ? '#FEF3C7' :
                            vStatus === 'REJECTED' ? '#FEE2E2' : '#F3F4F6',
                          color:
                            vStatus === 'VERIFIED' ? '#065F46' :
                            vStatus === 'PENDING' ? '#92400E' :
                            vStatus === 'REJECTED' ? '#991B1B' : '#4B5563'
                        }}>
                          {vStatus === 'NONE' ? 'NO EVIDENCE' : vStatus}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontSize: '0.775rem' }}>
                          {item.assignment.deadline ? new Date(item.assignment.deadline).toLocaleDateString() : 'No deadline'}
                          {item.isOverdue && (
                            <span style={{ display: 'inline-block', marginLeft: '0.35rem', color: '#DC2626', fontWeight: 700, fontSize: '0.675rem', backgroundColor: '#FEE2E2', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                              OVERDUE
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {item.latestEvidence ? (
                          <button
                            type="button"
                            onClick={() => handleOpenEvidence(
                              item.latestEvidence?.certificate_storage_path,
                              item.latestEvidence?.credential_url,
                              item.latestEvidence?.credential_id
                            )}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            <ExternalLink size={12} />
                            View
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
