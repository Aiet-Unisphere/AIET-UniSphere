import { createClient } from '@supabase/supabase-js';

const url = 'https://eddsaafwwmtfnjukxamx.supabase.co';
const key = 'sb_publishable_VPuzw9E0F1iVXYFdiGMefw_dyryllZo';

const supabase = createClient(url, key);

async function main() {
  console.log('--- Checking departments table ---');
  const { data: depts, error: deptErr } = await supabase.from('departments').select('*');
  console.log('Departments query error:', deptErr);
  console.log('Departments:', depts);

  console.log('\n--- Checking RPC for table columns or profiles schema ---');
  const { data: prof, error: profErr } = await supabase.rpc('get_email_by_identifier', { identifier_input: 'ADM-001' });
  console.log('RPC result:', prof, profErr);
}

main();
