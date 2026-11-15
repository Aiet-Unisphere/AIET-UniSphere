import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type VerifyResult = {
  full_name?: string;
  usn_or_employee_id?: string;
  department_name?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  reviewed_at?: string;
  pdf_url?: string;
};

const VerifyLeavePage: React.FC = () => {
  const { verificationId } = useParams<{ verificationId: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!verificationId) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('leave_requests')
          .select(`*, student:profiles!student_id(full_name, usn_or_employee_id), department:departments(name)`)
          .eq('verification_id', verificationId)
          .single();

        if (error || !data) {
          setError('Verification failed or record not found.');
          setLoading(false);
          return;
        }

        const record: any = data;
        setResult({
          full_name: record.student?.full_name,
          usn_or_employee_id: record.student?.usn_or_employee_id,
          department_name: record.department?.name,
          start_date: record.start_date,
          end_date: record.end_date,
          status: record.status,
          reviewed_at: record.reviewed_at,
          pdf_url: record.pdf_url
        });

        // If a private PDF exists, request a short-lived signed URL from the server-side function
        if (record.pdf_url) {
          try {
            const invokeResult: any = await (supabase as any).functions.invoke('get-signed-url', {
              body: { bucket: 'leave-pdfs', path: record.pdf_url, expires: 300 }
            });
            // invokeResult may be { data: { signedUrl } } or { signedUrl }
            const signedUrl = (invokeResult?.data && (invokeResult.data.signedUrl || invokeResult.data.signedURL)) || invokeResult?.signedUrl || invokeResult?.signedURL || null;
            if (signedUrl) {
              setResult(prev => prev ? { ...prev, pdf_url: signedUrl } : prev);
            }
          } catch (e) {
            console.warn('Failed to get signed URL for PDF', e);
          }
        }

        setLoading(false);
      } catch (e) {
        setError('An error occurred while verifying.');
        setLoading(false);
      }
    })();
  }, [verificationId]);

  if (loading) return <div>Verifying...</div>;
  if (error) return <div>{error}</div>;
  if (!result) return <div>Not found</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Leave Verification</h2>
      <p><strong>Name:</strong> {result.full_name}</p>
      <p><strong>USN/ID:</strong> {result.usn_or_employee_id}</p>
      <p><strong>Department:</strong> {result.department_name}</p>
      <p><strong>From:</strong> {result.start_date}</p>
      <p><strong>To:</strong> {result.end_date}</p>
      <p><strong>Status:</strong> {result.status}</p>
      <p><strong>Approved on:</strong> {result.reviewed_at}</p>
      {result.pdf_url ? (
        <p>
          <a href={`https://YOUR_SUPABASE_STORAGE_URL/${result.pdf_url}`} target="_blank" rel="noreferrer">Download PDF</a>
        </p>
      ) : null}
    </div>
  );
};

export default VerifyLeavePage;
