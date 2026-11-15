import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { updateDepartmentSeal } from '../../services/departmentService';

export const HODSealManager: React.FC = () => {
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [currentSealUrl, setCurrentSealUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await (supabase as any).auth.getUser();
      if (!user) return;

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('department_id')
        .eq('id', user.id)
        .single();

      if (!profile?.department_id) return;
      setDepartmentId(profile.department_id);

      const { data: dept } = await (supabase as any).from('departments').select('seal_url').eq('id', profile.department_id).single();
      setCurrentSealUrl(dept?.seal_url || null);
    })();
  }, []);

  const handleUpload = async () => {
    if (!departmentId || !file) return setStatus('Please select a file and ensure department is known.');
    setStatus('Uploading...');
    try {
      const url = await updateDepartmentSeal(departmentId, file);
      setCurrentSealUrl(url);
      setStatus('Seal uploaded and department updated.');
    } catch (e: any) {
      setStatus(`Upload failed: ${e?.message || e}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Department Seal</h2>
      {currentSealUrl ? (
        <div>
          <p>Current seal:</p>
          <img src={currentSealUrl} alt="Department Seal" style={{ maxWidth: 300, border: '1px solid #ccc', padding: 4 }} />
        </div>
      ) : (
        <p>No seal set yet. Placeholder 'AIET COLLEGE MOODBIDRI' will be used in PDFs.</p>
      )}

      <div style={{ marginTop: 16 }}>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
        <button onClick={handleUpload} style={{ marginLeft: 8 }}>Upload Seal</button>
      </div>

      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
};
