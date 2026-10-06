import { ErrorState } from '../components/ErrorState';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, FileCheck } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { ServiceCard } from '../components/ServiceCard';
import { RequestFormModal } from '../components/RequestFormModal';
import type { ServiceTypeItem, CreateServiceRequestPayload } from '../data/studentServices';
import { getAvailableServices, createServiceRequest } from '../services/studentService';

export const StudentServicesPage: React.FC = () => {
  const navigate = useNavigate();

  const [services, setServices] = useState<ServiceTypeItem[]>([]);
  const [selectedServiceForModal, setSelectedServiceForModal] = useState<ServiceTypeItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await getAvailableServices();
        setServices(data);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load student services.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleOpenModal = (service: ServiceTypeItem | null = null) => {
    setSelectedServiceForModal(service);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (payload: CreateServiceRequestPayload) => {
    await createServiceRequest(payload);
    setIsModalOpen(false);
    navigate('/student/services/requests', { state: { requestSubmitted: true } });
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header-container">
        <div>
          <div className="breadcrumbs">
            <span>Student Services</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>Services & Applications</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Student Support Services</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Apply for official bonafide certificates, submit grievances, share course feedback, or request technical support.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => navigate('/student/services/requests')}
          >
            <Clock size={16} />
            <span>My Active Requests</span>
          </button>

          <button 
            className="btn btn-primary" 
            onClick={() => handleOpenModal(null)}
            disabled={isLoading || Boolean(loadError) || services.length === 0}
          >
            <Plus size={16} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading available student services..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => {
          setIsLoading(true);
          setLoadError(null);
          getAvailableServices().then(setServices).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Unable to load student services.')).finally(() => setIsLoading(false));
        }} />
      ) : services.length === 0 ? (
        <EmptyState title="No services available" message="The institution has not published any active student services." />
      ) : (
        <div className="services-catalog-grid">
          {services.map((srv) => (
            <ServiceCard
              key={srv.id}
              service={srv}
              onSelectService={(service) => handleOpenModal(service)}
            />
          ))}
        </div>
      )}

      {/* Request Form Modal */}
      {isModalOpen && (
        <RequestFormModal
          service={selectedServiceForModal}
          services={services}
          onClose={() => setIsModalOpen(false)}
            onSubmitRequest={handleFormSubmit}
        />
      )}
    </AppShell>
  );
};

export default StudentServicesPage;
