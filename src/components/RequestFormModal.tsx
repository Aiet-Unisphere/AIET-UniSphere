import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import type { ServiceTypeItem, CreateServiceRequestPayload } from '../data/studentServices';
import { FormField } from './FormField';

interface RequestFormModalProps {
  service: ServiceTypeItem | null;
  services: ServiceTypeItem[];
  onClose: () => void;
  onSubmitRequest: (payload: CreateServiceRequestPayload) => Promise<void>;
}

export const RequestFormModal: React.FC<RequestFormModalProps> = ({
  service,
  services,
  onClose,
  onSubmitRequest
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState(service?.id || services[0]?.id || '');
  const [subject, setSubject] = useState(service ? `${service.title} Request` : '');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ subject?: string; description?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const handleServiceChange = (id: string) => {
    setSelectedServiceId(id);
    const selected = services.find(item => item.id === id);
    if (selected) setSubject(`${selected.title} Request`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmissionError(null);
    const newErrors: { subject?: string; description?: string } = {};
    const currentService = services.find(item => item.id === selectedServiceId);

    if (!currentService) newErrors.subject = 'Select an available service before submitting.';
    if (!subject.trim()) newErrors.subject = 'Subject line is required.';
    if (!description.trim()) newErrors.description = 'Please provide a detailed reason for your request.';
    if (currentService?.requiredDocs && !selectedFile) newErrors.description = 'This service requires a supporting document.';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0 || !currentService) return;

    setIsSubmitting(true);
    try {
      await onSubmitRequest({
        serviceTypeId: selectedServiceId,
        requestType: currentService.title,
        subject: subject.trim(),
        description: description.trim(),
        attachmentName: selectedFile?.name,
        attachmentSize: selectedFile?.size,
        file: selectedFile || undefined,
      });
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Unable to submit this request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={isSubmitting ? undefined : onClose}>
      <div className="modal-container" style={{ maxWidth: '600px' }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="badge badge-active font-mono">New Request Form</span>
            <h2 className="modal-title font-display" style={{ marginTop: '0.25rem' }}>
              Submit Student Service Request
            </h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close" disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label" htmlFor="service-type">Service Type</label>
              <select
                id="service-type"
                className="form-control font-sans"
                value={selectedServiceId}
                onChange={(event) => handleServiceChange(event.target.value)}
                disabled={isSubmitting || services.length === 0}
                required
              >
                {services.map(item => <option key={item.id} value={item.id}>{item.title} ({item.category})</option>)}
              </select>
            </div>

            <FormField
              label="Subject / Topic"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Brief summary of your request"
              errorMessage={errors.subject}
              required
            />

            <div className="form-group">
              <label className="form-label" htmlFor="service-description">
                Detailed Description <span className="text-orange">*</span>
              </label>
              <textarea
                id="service-description"
                className={`form-control font-sans ${errors.description ? 'is-invalid' : ''}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Provide the details needed to process your request."
                rows={4}
                disabled={isSubmitting}
                required
              />
              {errors.description && <span className="form-error-msg">{errors.description}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="service-attachment">Supporting Document</label>
              <input
                id="service-attachment"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className="font-sans"
                style={{ fontSize: '0.85rem' }}
                disabled={isSubmitting}
                required={services.find(item => item.id === selectedServiceId)?.requiredDocs || false}
              />
              <span className="font-mono text-dark-grey" style={{ fontSize: '0.75rem', marginTop: '0.2rem', display: 'block' }}>
                PDF, JPG, PNG, DOC up to 20MB stored securely in Supabase Storage.
              </span>
            </div>
            {submissionError && <p className="form-error-msg" role="alert">{submissionError}</p>}
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || services.length === 0}>
              <Send size={16} />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};