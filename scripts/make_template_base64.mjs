import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const templatePath = path.join(rootDir, 'public', 'templates', '1000230720.pdf');
const bytes = fs.readFileSync(templatePath);
const b64 = bytes.toString('base64');

const tsContent = `// Authoritative physical AIET Leave Note PDF template (1000230720.pdf)
// Exact original template binary embedded as Base64 to ensure instant, offline, deterministic rendering.
export const AIET_LEAVE_NOTE_TEMPLATE_BASE64 = "${b64}";
`;

const outPath = path.join(rootDir, 'src', 'assets', 'templates', 'aietLeaveNoteTemplateBase64.ts');
fs.writeFileSync(outPath, tsContent);
console.log(`Created ${outPath} (${b64.length} chars, original bytes: ${bytes.length})`);

