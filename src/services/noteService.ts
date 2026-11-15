import { supabase } from '../lib/supabase';
import type { DBStudentNote } from '../types/database.types';

export type Note = DBStudentNote;

export interface CreateNotePayload {
  title?: string;
  content?: string;
}

export interface UpdateNotePayload {
  title?: string;
  content?: string;
}

/**
 * Fetch all notes belonging to the currently authenticated student.
 * Notes are ordered with the most recently updated notes first.
 */
export async function getStudentNotes(): Promise<Note[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required to view notes.');
  }

  const { data, error } = await (supabase as any)
    .from('student_notes')
    .select('*')
    .eq('student_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[noteService] Error fetching student notes:', error);
    throw new Error(error.message || 'Failed to fetch notes.');
  }

  return (data as Note[]) || [];
}

/**
 * Fetch a single note by ID, verifying ownership for the authenticated student.
 */
export async function getStudentNote(id: string): Promise<Note | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required to view this note.');
  }

  const { data, error } = await (supabase as any)
    .from('student_notes')
    .select('*')
    .eq('id', id)
    .eq('student_id', user.id)
    .maybeSingle();

  if (error) {
    console.error(`[noteService] Error fetching note ${id}:`, error);
    throw new Error(error.message || 'Failed to load note.');
  }

  if (!data) return null;
  return data as Note;
}

/**
 * Create a new personal note for the authenticated student.
 */
export async function createStudentNote(payload: CreateNotePayload = {}): Promise<Note> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required to create a note.');
  }

  const title = payload.title !== undefined ? payload.title.trim() : 'Untitled Note';
  const content = payload.content !== undefined ? payload.content : '';

  const { data, error } = await (supabase as any)
    .from('student_notes')
    .insert({
      student_id: user.id,
      title: title || 'Untitled Note',
      content
    })
    .select()
    .single();

  if (error) {
    console.error('[noteService] Error creating note:', error);
    throw new Error(error.message || 'Failed to create note.');
  }

  return data as Note;
}

/**
 * Update an existing note's title and/or content with ownership verification.
 */
export async function updateStudentNote(id: string, payload: UpdateNotePayload): Promise<Note> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required to update note.');
  }

  const updateFields: { title?: string; content?: string; updated_at?: string } = {
    updated_at: new Date().toISOString()
  };

  if (payload.title !== undefined) {
    updateFields.title = payload.title;
  }
  if (payload.content !== undefined) {
    updateFields.content = payload.content;
  }

  const { data, error } = await (supabase as any)
    .from('student_notes')
    .update(updateFields)
    .eq('id', id)
    .eq('student_id', user.id)
    .select()
    .single();

  if (error) {
    console.error(`[noteService] Error updating note ${id}:`, error);
    throw new Error(error.message || 'Failed to update note.');
  }

  return data as Note;
}

/**
 * Permanently delete a note with ownership verification.
 */
export async function deleteStudentNote(id: string): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required to delete note.');
  }

  const { error } = await (supabase as any)
    .from('student_notes')
    .delete()
    .eq('id', id)
    .eq('student_id', user.id);

  if (error) {
    console.error(`[noteService] Error deleting note ${id}:`, error);
    throw new Error(error.message || 'Failed to delete note.');
  }

  return true;
}

/**
 * Filter notes in-memory by query string against title and content.
 */
export function filterNotes(notes: Note[], query: string): Note[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return notes;

  return notes.filter((n) => {
    const titleMatch = (n.title || '').toLowerCase().includes(cleanQuery);
    const contentMatch = (n.content || '').toLowerCase().includes(cleanQuery);
    return titleMatch || contentMatch;
  });
}
