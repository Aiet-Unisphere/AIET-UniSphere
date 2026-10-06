import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://eddsaafwwmtfnjukxamx.supabase.co';
const supabaseKey = 'sb_publishable_VPuzw9E0F1iVXYFdiGMefw_dyryllZo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRpc() {
  console.log('Testing RPC existence...');
  const { data, error } = await supabase.rpc('get_faculty_assessment_submissions', { p_assessment_id: '00000000-0000-0000-0000-000000000000' });
  console.log('RPC result:', data, 'Error:', error);
}

checkRpc();
