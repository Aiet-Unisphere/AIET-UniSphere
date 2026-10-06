import React from 'react';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ServiceRequestItem } from '../data/studentServices';

interface RequestCardProps {
  request: ServiceRequestItem;
}

export const RequestCard: React.FC<RequestCardProps> = ({ request }) => {
  const navigate = useNavigate();

  const getStatusBadge = (status: ServiceRequestItem['status']) => {
    switch (status) {
      case 'Resolved':
        return <span className="badge badge-active font-mono">{status}</span>;
      case 'In Review':
        return <span className="badge badge-pending font-mono">In Review</span>;
      case 'Pending':
        return <span className="badge badge-upcoming font-mono">Pending</span>;
      case 'Rejected':
      default:
        return <span className="badge badge-overdue font-mono">Rejected</span>;
    }
  };

  return (
    <div className="request-card-item">
      <div className="request-card-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="font-mono font-bold" style={{ fontSize: '0.85rem', color: 'var(--brand-black)' }}>
            {request.id}
          </span>
          <span className="badge badge-secondary font-mono" style={{ fontSize: '0.7rem' }}>
            {request.requestType}
          </span>
        </div>

        {getStatusBadge(request.status)}
      </div>

      <h3 className="request-card-subject">{request.subject}</h3>
      <p className="request-card-desc font-sans">{request.description}</p>

      <div className="request-card-footer">
        <div className="request-date-group font-mono">
          <span>
            <Calendar size={12} style={{ display: 'inline', marginRight: '0.2rem' }} />
            Submitted: {request.submittedDate}
          </span>
          <span>
            <Clock size={12} style={{ display: 'inline', marginRight: '0.2rem', marginLeft: '0.5rem' }} />
            Updated: {request.lastUpdatedDate}
          </span>
        </div>

        <button 
          className="btn btn-secondary" 
          style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          onClick={() => navigate(`/student/services/requests/${request.id}`)}
        >
          <span>View Details & Timeline</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
