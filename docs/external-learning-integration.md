# External Learning Integration Architecture & Security Boundary
**AIET-UniSphere — Platform Integration Guidelines**

---

## 1. CURRENT STATE
- **Operational Model**: The External Learning tracking system functions complete and fully security-hardened without third-party API credentials.
- **External Course Links**: External courses (Coursera, NPTEL, edX, Udemy, SWAYAM) are accessed via standard web URLs (`external_url`).
- **Student Self-Reported Progress**: Students update their learning milestones via local component forms, stored in `external_course_progress` with `source = 'SELF_REPORTED'`.
- **Faculty Progress Management**: Faculty members can adjust student progress milestones, stored with `source = 'FACULTY_UPDATED'`.
- **Completion Evidence & Verification**: Students upload certificate documents or submit credential verification links (`external_course_evidence`). Faculty/HOD approve or reject evidence using the atomic SECURITY DEFINER RPC `verify_external_course_evidence`. Verified completions set enrollment status to `COMPLETED`.

---

## 2. FUTURE STATE ARCHITECTURE
- **External API Source**: The enum value `source = 'EXTERNAL_API'` in `external_course_progress` is explicitly reserved for trusted server-side background synchronization.
- **Server-Side Execution**: All future external platform synchronization adapters (e.g. `courseraAdapter.ts`) must run server-side inside Supabase Edge Functions or background cron jobs.
- **Zero Client Secret Exposure**: OAuth client secrets, API keys, and enterprise organization tokens must live strictly in secure server secrets (e.g. Supabase Secret Vault). They must **NEVER** reach React client bundles, `localStorage`, `sessionStorage`, or browser network requests.
- **Webhook & xAPI Event Security**: Inbound completion webhooks or xAPI event streams must authenticate incoming payload signatures before executing database updates.
- **RLS Boundary Compliance**: Ingested external platform data must respect UniSphere's database RLS boundaries, student-to-student isolation, and department-scoped authorization.

---

## 3. COURSERA INTEGRATION CONDITION
- **Enterprise Credential Requirement**: Automated learner enrollment, progress reporting, completion lookups, and xAPI event streaming from Coursera are **strictly conditional** on AIET holding an active Coursera for Campus or Enterprise contract and provisioned Developer Portal credentials.
- **Prohibited Workarounds**:
  - **NO Web Scraping**: Unofficial DOM scraping or automated browser bots are strictly prohibited.
  - **NO Reverse-Engineered Endpoints**: Private/undocumented internal endpoints must not be called.
  - **NO Fake Production Mocks**: Fake or mock synchronization loops must not be deployed to production.
- **Integration Readiness**: UniSphere's database schema, platform-neutral integration contract (`ExternalLearningPlatformAdapter`), RLS security policies, and verification workflows are 100% integration-ready. Active synchronization will be activated only when official enterprise credentials are provided.
