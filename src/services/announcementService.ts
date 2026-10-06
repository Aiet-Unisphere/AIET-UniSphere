import { supabase } from '../lib/supabase';
import type { Announcement } from '../data/announcements';
import { 
  STORAGE_BUCKETS, 
  uploadFile, 
  getSignedUrl, 
  downloadStorageFile, 
  sanitizeFileName 
} from './storageService';

// Helper to map DB row to frontend Announcement
const mapDBRowToAnnouncement = (row: any): Announcement => {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category as 'Academic' | 'Exam' | 'Event' | 'General',
    departmentId: row.department_id,
    departmentName: row.departments?.name || 'Department',
    createdBy: row.profiles?.full_name || 'Department Head',
    authorRole: (row.profiles?.role || 'HOD') as 'HOD' | 'Faculty' | 'Admin',
    targetAudience: row.target_audience as 'Students' | 'Faculty' | 'Students + Faculty',
    publishedAt: row.published_at ? new Date(row.published_at).toLocaleString() : new Date(row.created_at).toLocaleString(),
    status: row.status === 'PUBLISHED' ? 'Published' : 'Draft',
    attachmentPath: row.attachment_path || row.storage_path || undefined,
    attachmentName: row.attachment_name || row.file_name || undefined,
    attachmentSize: row.attachment_size ? Number(row.attachment_size) : undefined,
    attachmentType: row.attachment_type || row.mime_type || undefined
  };
};

// Helper to send notifications when an announcement is published
const sendAnnouncementNotifications = async (announcement: any) => {
  try {
    const departmentId = announcement.department_id;
    const target = announcement.target_audience;
    
    // Determine roles to notify
    let rolesToNotify: string[] = [];
    if (target === 'Students') {
      rolesToNotify = ['STUDENT'];
    } else if (target === 'Faculty') {
      rolesToNotify = ['FACULTY'];
    } else {
      rolesToNotify = ['STUDENT', 'FACULTY'];
    }

    // Fetch all profiles in this department with these roles
    const { data: targetProfiles, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('department_id', departmentId)
      .in('role', rolesToNotify);

    if (error) {
      console.error('Error fetching profiles to notify:', error);
      return;
    }

    if (!targetProfiles || targetProfiles.length === 0) return;

    // Create notifications for all these users
    const notificationsToInsert = targetProfiles.map((p: any) => ({
      user_id: p.id,
      title: `New Notice: ${announcement.title}`,
      short_message: announcement.content.length > 80 ? announcement.content.substring(0, 77) + '...' : announcement.content,
      full_message: announcement.content,
      source: 'Announcement',
      category: 'Academic',
      type: 'ANNOUNCEMENT',
      related_link: `/announcements`,
      is_read: false
    }));

    const { error: notifError } = await (supabase as any)
      .from('notifications')
      .insert(notificationsToInsert);

    if (notifError) {
      console.error('Error inserting announcement notifications:', notifError);
    }
  } catch (err) {
    console.error('Failed to send announcement notifications:', err);
  }
};

export const getDepartmentAnnouncements = async (departmentId?: string): Promise<Announcement[]> => {
  let query = supabase
    .from('announcements')
    .select(`
      *,
      profiles:created_by (
        full_name,
        role
      ),
      departments:department_id (
        name
      )
    `)
    .order('created_at', { ascending: false });
  
  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }
  
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching announcements:', error);
    return [];
  }
  
  return (data || []).map(mapDBRowToAnnouncement);
};

export const getAnnouncementById = async (id: string): Promise<Announcement | null> => {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      profiles:created_by (
        full_name,
        role
      ),
      departments:department_id (
        name
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching announcement by id:', error);
    return null;
  }

  return data ? mapDBRowToAnnouncement(data) : null;
};

export const createDepartmentAnnouncement = async (data: {
  title: string;
  content: string;
  category: 'Academic' | 'Exam' | 'Event' | 'General';
  departmentId: string;
  createdBy: string; // Profile UUID
  targetAudience: 'Students' | 'Faculty' | 'Students + Faculty';
  status: 'Published' | 'Draft';
  file?: File;
}): Promise<Announcement | null> => {
  const tempAnnounceId = crypto.randomUUID ? crypto.randomUUID() : `ann-${Date.now()}`;
  let storagePath: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (data.file) {
    fileName = data.file.name;
    fileSize = data.file.size;
    mimeType = data.file.type || 'application/pdf';
    const safeName = sanitizeFileName(data.file.name);

    // Predictable path: announcements/{department_id}/{announcement_id}/{file_name}
    storagePath = `${data.departmentId}/${tempAnnounceId}/${safeName}`;

    await uploadFile({
      bucket: STORAGE_BUCKETS.ANNOUNCEMENTS,
      path: storagePath,
      file: data.file,
      upsert: true
    });
  }

  const { data: inserted, error } = await (supabase as any)
    .from('announcements')
    .insert({
      id: tempAnnounceId,
      title: data.title,
      content: data.content,
      category: data.category,
      department_id: data.departmentId,
      created_by: data.createdBy,
      target_audience: data.targetAudience,
      status: data.status === 'Published' ? 'PUBLISHED' : 'DRAFT',
      published_at: data.status === 'Published' ? new Date().toISOString() : null,
      attachment_path: storagePath,
      attachment_name: fileName,
      attachment_size: fileSize,
      attachment_type: mimeType
    })
    .select(`
      *,
      profiles:created_by (
        full_name,
        role
      ),
      departments:department_id (
        name
      )
    `)
    .single();

  if (error) {
    console.error('Error creating announcement:', error);
    throw new Error(error.message);
  }

  if (data.status === 'Published' && inserted) {
    await sendAnnouncementNotifications(inserted);
  }

  return inserted ? mapDBRowToAnnouncement(inserted) : null;
};

export const publishAnnouncement = async (id: string): Promise<Announcement | null> => {
  const { data: updated, error } = await (supabase as any)
    .from('announcements')
    .update({
      status: 'PUBLISHED',
      published_at: new Date().toISOString()
    })
    .eq('id', id)
    .select(`
      *,
      profiles:created_by (
        full_name,
        role
      ),
      departments:department_id (
        name
      )
    `)
    .single();

  if (error) {
    console.error('Error publishing announcement:', error);
    throw new Error(error.message);
  }

  if (updated) {
    await sendAnnouncementNotifications(updated);
  }

  return updated ? mapDBRowToAnnouncement(updated) : null;
};

export const deleteAnnouncement = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    return false;
  }
  return true;
};

export const getReadAnnouncements = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching read announcements:', error);
    return [];
  }

  return (data || []).map((row: any) => row.announcement_id);
};

export const markAnnouncementAsRead = async (announcementId: string, userId: string): Promise<boolean> => {
  const { error } = await (supabase as any)
    .from('announcement_reads')
    .upsert({
      announcement_id: announcementId,
      user_id: userId,
      read_at: new Date().toISOString()
    }, { onConflict: 'announcement_id,user_id' });

  if (error) {
    console.error('Error marking announcement as read:', error);
    return false;
  }
  return true;
};

/**
 * Helper to download an announcement attachment from Supabase Storage.
 */
export const downloadAnnouncementAttachment = async (storagePath: string, fileName?: string): Promise<void> => {
  await downloadStorageFile(STORAGE_BUCKETS.ANNOUNCEMENTS, storagePath, fileName);
};

/**
 * Get signed URL for announcement attachment
 */
export const getAnnouncementAttachmentUrl = async (storagePath: string): Promise<string | null> => {
  return await getSignedUrl(STORAGE_BUCKETS.ANNOUNCEMENTS, storagePath, 3600);
};
