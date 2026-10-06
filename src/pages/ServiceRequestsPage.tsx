import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { RequestCard } from '../components/RequestCard';
import { RequestFormModal } from '../components/RequestFormModal';
import type { ServiceRequestItem, ServiceTypeItem, CreateServiceRequestPayload } from '../data/studentServices';
import { getServiceRequests, getAvailableServices, createServiceRequest } from '../services/studentService';

export const ServiceRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [services, setServices] = useState<ServiceTypeItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(location.state?.requestSubmitted ? 'Your request was submitted and saved.' : '');

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [reqs, srvs] = await Promise.all([getServiceRequests(), getAvailableServices()]);
        setRequests(reqs);
        setServices(srvs);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load service requests.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleFormSubmit = async (payload: CreateServiceRequestPayload) => {
    const newReq = await createServiceRequest(payload);
    setRequests(prev => [newReq, ...prev]);
    setIsModalOpen(false);
    setSuccessMessage('Your request was submitted and saved.');
  };

  const filteredRequests = statusFilter === 'All' 
    ? requests 
    : requests.filter(r => r.status.toLowerCase() === statusFilter.toLowerCase());

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Student Services</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>My Service Requests</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Track Submitted Requests</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Monitor real-time progress and administrative timelines for your applications and grievances.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => navigate('/student/services')}
          >
            <ArrowLeft size={16} />
            <span>Service Catalog</span>
          </button>

          <button 
            className="btn btn-primary" 
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Filter Selector */}
      <div className="filter-search-container" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="font-mono text-dark-grey" style={{ fontSize: '0.85rem' }}>Filter by Status:</span>
          <select
            className="form-control filter-select font-sans"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in review">In Review</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {successMessage && <div className="state-container" role="status">{successMessage}</div>}
      {isLoading ? (
        <LoadingState message="Fetching your submitted service requests..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => {
          setIsLoading(true);
          Promise.all([getServiceRequests(), getAvailableServices()]).then(([reqs, srvs]) => {
            setRequests(reqs);
            setServices(srvs);
            setLoadError(null);
          }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Unable to load service requests.')).finally(() => setIsLoading(false));
        }} />
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          title="No Requests Found"
          message={requests.length === 0 ? 'You have not submitted a service request yet.' : 'No service requests match the selected status filter.'}
        />
      ) : (
        <div className="service-requests-list">
          {filteredRequests.map((req) => (
            <RequestCard key={req.id} request={req} />
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {isModalOpen && (
        <RequestFormModal
          service={null}
          services={services}
          onClose={() => setIsModalOpen(false)}
          onSubmitRequest={handleFormSubmit}
        />
      )}
    </AppShell>
  );
};

export default ServiceRequestsPage;
