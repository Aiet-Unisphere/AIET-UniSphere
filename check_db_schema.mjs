import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before running this check.');
}

const supabase = createClient(url, key);

async function main() {
  const { count, error: departmentError } = await supabase
    .from('departments')
    .select('id', { count: 'exact', head: true });
  if (departmentError) throw new Error(`Database connectivity check failed: ${departmentError.message}`);
  console.log(`Supabase reachable; ${count ?? 0} department records are visible to this key.`);

  const { error: identifierError } = await supabase.rpc('get_email_by_identifier', {
    identifier_input: 'unisphere-security-probe-no-match',
  });
  const accessBlocked = identifierError && /permission denied|not authorized|function .* does not exist|schema cache/i.test(identifierError.message);
  if (!accessBlocked) {
    throw new Error('The legacy email-resolution RPC is still callable. Apply migration 00016 before deployment.');
  }
  console.log('Anonymous execution of the legacy identifier email lookup is blocked.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Schema validation failed.');
  process.exitCode = 1;
});
