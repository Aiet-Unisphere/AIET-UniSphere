// Supabase Edge Function: generate-leave-pdf
// Note: Deploy this function to Supabase Edge Functions and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the function's env.

import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@2.4.0';

// Helper to fetch binary as Uint8Array
async function fetchAsUint8Array(url: string) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json();
    const leaveId = body?.leave_id;
    if (!leaveId) return new Response(JSON.stringify({ error: 'leave_id required' }), { status: 400 });

    // Load leave request and related data
    const { data: l, error: lErr } = await sb.from('leave_requests').select(`*, student:profiles!student_id(full_name, usn_or_employee_id, department:departments(name), email), department:departments(seal_url, name)`).eq('id', leaveId).single();
    if (lErr || !l) {
      console.error('Leave fetch error', lErr);
      return new Response(JSON.stringify({ error: 'Leave not found' }), { status: 404 });
    }

    const verificationId = crypto.randomUUID();

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();

    // Header: College name and department
    page.drawText('AIET COLLEGE MOODBIDRI', { x: 40, y: height - 80, size: 18, font: helveticaFont, color: rgb(0.06, 0.06, 0.06) });
    page.drawText(l.department?.name || 'Department', { x: 40, y: height - 104, size: 12, font: regularFont, color: rgb(0.2, 0.2, 0.2) });

    // Student details and leave details
    page.drawText(`Student: ${l.student?.full_name || 'Student'}`, { x: 40, y: height - 150, size: 12, font: regularFont });
    page.drawText(`USN/ID: ${l.student?.usn_or_employee_id || 'N/A'}`, { x: 40, y: height - 170, size: 12, font: regularFont });
    page.drawText(`Leave: ${l.leave_type}`, { x: 40, y: height - 190, size: 12, font: regularFont });
    page.drawText(`Dates: ${l.start_date} → ${l.end_date} (${l.end_date && l.start_date ? ( (new Date(l.end_date).getTime()-new Date(l.start_date).getTime())/(1000*60*60*24) +1 ) : ''} days)`, { x: 40, y: height - 210, size: 12, font: regularFont });

    // Reason
    page.drawText('Reason:', { x: 40, y: height - 240, size: 12, font: helveticaFont });
    const reasonTxt = l.reason || '';
    page.drawText(reasonTxt, { x: 40, y: height - 260, size: 11, font: regularFont, maxWidth: 515 });

    // HOD remark and approval date
    page.drawText(`Approved on: ${l.reviewed_at || new Date().toISOString()}`, { x: 40, y: height - 360, size: 11, font: regularFont });

    // Seal: if department seal exists, try to embed
    if (l.department?.seal_url) {
      try {
        const sealBytes = await fetchAsUint8Array(l.department.seal_url);
        const sealImage = await pdfDoc.embedPng(sealBytes).catch(async () => {
          // try jpeg
          return await pdfDoc.embedJpg(sealBytes);
        });
        if (sealImage) {
          const sealDims = sealImage.scale(0.25);
          page.drawImage(sealImage, { x: width - 150, y: height - 180, width: sealDims.width, height: sealDims.height });
        }
      } catch (e) {
        console.warn('Failed embedding seal', e);
      }
    } else {
      // If no seal image, print department name as seal placeholder
      page.drawText('AIET COLLEGE MOODBIDRI', { x: width - 200, y: height - 140, size: 10, font: helveticaFont });
    }

    // QR code generation via Google Chart API (public) encoding verification URL — replace with your domain
    const domain = Deno.env.get('PUBLIC_DOMAIN') || 'https://your-domain.example.com';
    const verificationUrl = `${domain}/verify/leave/${verificationId}`;
    const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(verificationUrl)}`;
    try {
      const qrBytes = await fetchAsUint8Array(qrUrl);
      const qrImage = await pdfDoc.embedPng(qrBytes).catch(async () => await pdfDoc.embedJpg(qrBytes));
      if (qrImage) {
        const qrDims = qrImage.scale(0.9);
        page.drawImage(qrImage, { x: width - 180, y: 60, width: 120, height: 120 });
      }
    } catch (e) {
      console.warn('Failed to embed QR', e);
    }

    // Save PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Upload to Storage: leave-pdfs bucket
    const pdfPath = `${l.department_id || 'dept'}/${l.id}.pdf`;
    const { error: uploadErr } = await sb.storage.from('leave-pdfs').upload(pdfPath, new Blob([pdfBytes]), { upsert: true });
    if (uploadErr) {
      console.error('PDF upload failed', uploadErr);
      return new Response(JSON.stringify({ error: 'PDF upload failed' }), { status: 500 });
    }

    // Save pdf_url and verification_id to leave_requests
    const { error: updateErr } = await sb.from('leave_requests').update({ pdf_url: pdfPath, verification_id: verificationId }).eq('id', l.id);
    if (updateErr) {
      console.error('Updating leave with pdf_url failed', updateErr);
      return new Response(JSON.stringify({ error: 'DB update failed' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, pdf_path: pdfPath, verification_id: verificationId }), { status: 200 });
  } catch (err) {
    console.error('generate-leave-pdf error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
