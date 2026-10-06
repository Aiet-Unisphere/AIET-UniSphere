import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { RequestTimeline } from '../components/RequestTimeline';
import type { ServiceRequestItem } from '../data/studentServices';
import { getServiceRequestById, downloadServiceRequestAttachment } from '../services/studentService';

export const ServiceRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<ServiceRequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setIsLoading(true);
      const data = await getServiceRequestById(id);
      setRequest(data);
      setIsLoading(false);
    };
    loadData();
  }, [id]);

  if (isLoading) {
    return (
      <AppShell>
        <LoadingState message="Loading service request details..." />
      </AppShell>
    );
  }

  if (!request) {
    return (
      <AppShell>
        <ErrorState
          title="Service Request Not Found"
          message={`No request record found for ID "${id}".`}
          onRetry={() => navigate('/student/services/requests')}
        />
      </AppShell>
    );
  }

  const getStatusBadge = (status: ServiceRequestItem['status']) => {
    switch (status) {
      case 'Resolved':
        return <span className="badge badge-active font-mono" style={{ fontSize: '0.85rem' }}>{status}</span>;
      case 'In Review':
        return <span className="badge badge-pending font-mono" style={{ fontSize: '0.85rem' }}>In Review</span>;
      case 'Pending':
        return <span className="badge badge-upcoming font-mono" style={{ fontSize: '0.85rem' }}>Pending</span>;
      case 'Rejected':
      default:
        return <span className="badge badge-overdue font-mono" style={{ fontSize: '0.85rem' }}>Rejected</span>;
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <button 
            className="btn btn-secondary font-mono" 
            onClick={() => navigate('/student/services/requests')}
            style={{ width: 'auto', padding: '0.35rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}
          >
            <ArrowLeft size={14} />
            <span>Back to Requests</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="font-mono font-bold" style={{ fontSize: '1.1rem', color: 'var(--brand-black)' }}>
              {request.id}
            </span>
            {getStatusBadge(request.status)}
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' }}>{request.subject}</h1>
        </div>
      </div>

      <div className="request-detail-grid">
        {/* Main Details Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Overview Info Card */}
          <div className="card-box">
            <h3 className="section-title font-display mb-3">Request Summary</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }} className="font-mono">
              <div>
                <span className="text-dark-grey" style={{ fontSize: '0.75rem' }}>Service Type:</span>
                <div style={{ fontWeight: 600, color: 'var(--brand-black)', fontSize: '0.9rem' }}>
                  {request.requestType}
                </div>
              </div>

              <div>
                <span className="text-dark-grey" style={{ fontSize: '0.75rem' }}>Submitted Date:</span>
                <div style={{ fontWeight: 600, color: 'var(--brand-black)', fontSize: '0.9rem' }}>
                  {request.submittedDate}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Description:</span>
              <p className="font-sans" style={{ fontSize: '0.9rem', color: 'var(--brand-black)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                {request.description}
              </p>
            </div>

            {request.remarks && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-success-bg)', borderLeft: '3px solid var(--color-success)', borderRadius: '4px' }}>
                <span className="font-mono font-bold text-success" style={{ fontSize: '0.8rem' }}>Latest Admin Remarks:</span>
                <p className="font-sans" style={{ fontSize: '0.85rem', color: 'var(--brand-black)', marginTop: '0.15rem' }}>
                  {request.remarks}
                </p>
              </div>
            )}

            {request.attachmentName && (
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--brand-border)' }}>
                <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem' }}>Attached Document:</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem', padding: '0.5rem', background: 'var(--brand-light-grey)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FileText size={16} className="text-orange" />
                    <span className="font-mono" style={{ fontSize: '0.825rem', fontWeight: 600 }}>{request.attachmentName}</span>
                    {request.attachmentSize && (
                      <span className="text-dark-grey" style={{ fontSize: '0.75rem' }}>
                        ({(request.attachmentSize / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                  {request.attachmentPath ? (
                    <button 
                      className="btn btn-secondary" 
                      style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={async () => {
                        try {
                          await downloadServiceRequestAttachment(request.attachmentPath!, request.attachmentName);
                        } catch (err: any) {
                          alert('Download failed: ' + (err.message || 'Unknown error'));
                        }
                      }}
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--brand-dark-grey)' }}>Saved in record</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Progression Column */}
        <div className="card-box">
          <RequestTimeline timeline={request.timeline} />
        </div>
      </div>
    </AppShell>
  );
};

export default ServiceRequestDetailPage;
