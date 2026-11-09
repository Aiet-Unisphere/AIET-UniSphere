# Mission 09.2.5 — Exact Original AIET Leave Note Automated PDF Generation

**Project:** AIET-UniSphere  
**Date:** November 10, 2026  
**Status:** COMPLETE & FULLY VERIFIED  
**Final Verdict:** `EXACT ORIGINAL TEMPLATE IMPLEMENTED`  

---

## 1. Executive Summary & Objective

In strict accordance with the owner's non-negotiable requirement, the downloadable approved leave note generation in AIET-UniSphere has been completely refactored to use the **original uploaded physical AIET Leave Note PDF (`1000230720.pdf`) as the immutable background template**.

All synthetic form redesigns, separate certificate layouts, and content rearrangements were dismantled. The system programmatically imports the original one-page document and overlays student particulars and approval endorsements directly onto the physical form's dotted lines and designated sections.

### Owner Requirements Adherence Matrix

| Requirement | Implementation Details | Verdict |
| :--- | :--- | :--- |
| **No Form Redesign** | Uses original `1000230720.pdf` as immutable vector/raster background | **PASS** |
| **No Separate Certificate** | One-page A4 document matching physical paper form | **PASS** |
| **Preserve Institutional Heading** | Original AIET crest logo, heading, campus address (`Shobavana Campus, Mijar, Moodbidri, DK-574225`), Phone `08258-262725`, Fax `08258-262726` intact | **PASS** |
| **Preserve Outer Border & Layout** | Original single-line rectangular border, title box, and section boxes preserved | **PASS** |
| **Overlaid Particulars on Dotted Lines** | Candidate Name, Branch, USN, Year/Sem, Section, Student Phone, Parent Phone, Leave Dates, Days, Reason, and Date positioned exactly on dotted baselines | **PASS** |
| **Blank Physical Signatures** | Mentor, Class Coordinator, Principal/AO, and SWO/Warden sections left completely blank for physical signing | **PASS** |
| **HOD Endorsement Bounding** | Fictional HOD signature, remarks, and demonstration badge confined strictly inside the existing HOD section (`y: 255 - 305 pt`) | **PASS** |
| **Preserve Printed Bottom Notes** | All 4 original printed notes preserved in their original typography and position (VTU 75% attendance, 3-day submission, guardian signature, medical certificate) | **PASS** |
| **Demonstration Disclaimers** | Prominently displays `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL`, `HOD APPROVED — DEMONSTRATION COPY`, and `[SAMPLE / DEMO SIGNATURE]` | **PASS** |
| **Single-Page Guarantee** | Strict 1-page A4 PDF output (21 KB vector PDF) | **PASS** |

---

## 2. Technical Architecture & Implementation

### 2.1 Authoritative Template Integration
- **Source File:** `1000230720.pdf` (18,509 bytes, 595 x 842 pt A4, 1 page).
- **Physical Asset Deployment:**
  - `public/templates/1000230720.pdf` (for public browser access).
  - `src/assets/templates/1000230720.pdf` (repository asset source).
  - `src/assets/templates/aietLeaveNoteTemplateBase64.ts` (24.6 KB base64 module for instant, offline, deterministic in-memory rendering across Node.js test runners and client browser environments).

### 2.2 PDF Generation Engine (`pdf-lib`)
The generation engine was migrated from client-side dynamic drawing (`jspdf`) to `pdf-lib`:
1. `PDFDocument.load(templateBytes)` loads the authentic template.
2. Embedded standard typography (`Helvetica`, `HelveticaBold`, `HelveticaOblique`).
3. Overlays dynamic data using calibrated point coordinates calibrated via RapidOCR box analysis:
   - **Student Name:** `x: 242 pt, y: 628 pt` (Bold, 9.0 pt, dark ink `#0F172A`)
   - **Branch:** `x: 432 pt, y: 628 pt` (Regular, 8.5 pt)
   - **USN:** `x: 127 pt, y: 598 pt` (Bold, 8.5 pt)
   - **Year / Semester:** `x: 305 pt, y: 598 pt` (Regular, 8.5 pt, e.g., `3rd / 6th`)
   - **Section:** `x: 414 pt, y: 598 pt` (Bold, 8.5 pt)
   - **Student Mobile:** `x: 228 pt, y: 569 pt` (Regular, 8.5 pt)
   - **Parent Mobile:** `x: 438 pt, y: 569 pt` (Regular, 8.5 pt)
   - **Leave From:** `x: 182 pt, y: 540 pt` (Bold, 8.5 pt)
   - **Leave To:** `x: 314 pt, y: 540 pt` (Bold, 8.5 pt)
   - **No. of Days:** `x: 488 pt, y: 540 pt` (Bold, 8.5 pt)
   - **Reason for Leave:** `x: 150 pt, y: 511 pt` (Line 1) and `x: 88 pt, y: 494 pt` (Line 2)
   - **Application Date:** `x: 136 pt, y: 455 pt` (Regular, 8.5 pt)
4. **HOD Section Containment:**
   - **Remarks:** `x: 202 pt, y: 293 pt` (Line 1) and `x: 88 pt, y: 278 pt` (Line 2, Oblique 7.5 pt)
   - **Sample Signature:** `Dr. S. K. Rao (Reviewer)`, `[SAMPLE / DEMO SIGNATURE]`, `HOD APPROVED — DEMONSTRATION COPY` at `x: 388 pt, y: 269–292 pt`
   - **Disclaimer:** `SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL` at `x: 88 pt, y: 262 pt`
5. **Physical Signature Preservation:**
   - Mentor section (`y: 355–406 pt`), Class Coordinator (`y: 307–351 pt`), Principal/AO (`y: 197–236 pt`), and SWO/Warden (`y: 137–180 pt`) remain 100% clean of programmatic text.
6. **Subtle Verification Footnote:**
   - Renders at `x: 80 pt, y: 28 pt` below printed notes: `AIET-UniSphere Document Id: <ID> | <Provenance> | Demonstration Copy | Page 1 of 1`.

---

## 3. Visual Acceptance & Scenario Verification

Three representative sample PDFs were generated into `docs/audit/samples/` and visually rendered at 144 DPI:

### Scenario A — Complete Student Information
- **Test File:** `docs/audit/samples/scenario_a_complete_student.pdf` (21,245 bytes)
- **High-Res Rendering:** `docs/audit/samples/scenario_a_complete_student.png`
- **Grayscale Verification:** `docs/audit/samples/scenario_a_complete_student_grayscale.png`
- **Comparison Image:** `docs/audit/samples/comparison_scenario_a_complete_student.png`
- **Verification Details:** All student particulars (Aditya Shenoy, 4AL22CS015, CSE, 3rd/6th, Section B, Student/Parent phones, 3 Days, VTU Hackathon reason) and HOD remarks perfectly overlay the template dotted lines.

### Scenario B — Missing Optional Information
- **Test File:** `docs/audit/samples/scenario_b_missing_optional.pdf` (21,226 bytes)
- **High-Res Rendering:** `docs/audit/samples/scenario_b_missing_optional.png`
- **Grayscale Verification:** `docs/audit/samples/scenario_b_missing_optional_grayscale.png`
- **Comparison Image:** `docs/audit/samples/comparison_scenario_b_missing_optional.png`
- **Verification Details:** Missing section and missing parent phone render as clean `-` placeholders without misaligning surrounding text or dotted lines.

### Scenario C — Historical Retroactive Backfill
- **Test File:** `docs/audit/samples/scenario_c_retroactive_backfill.pdf` (21,206 bytes)
- **High-Res Rendering:** `docs/audit/samples/scenario_c_retroactive_backfill.png`
- **Grayscale Verification:** `docs/audit/samples/scenario_c_retroactive_backfill_grayscale.png`
- **Comparison Image:** `docs/audit/samples/comparison_scenario_c_retroactive_backfill.png`
- **Verification Details:** Accurately reflects retroactive approval provenance (`Provenance: Retroactive Backfill (Current Profile)`) on the bottom verification margin.

---

## 4. Verification & Quality Gates

All rigorous project verification commands pass with zero failures:

```bash
# 1. Typecheck
$ npm run typecheck
> tsc -b --pretty false
(Passed cleanly, 0 errors)

# 2. Linter
$ npm run lint
> oxlint
Found 254 warnings and 0 errors.

# 3. Unit & Integration Test Suites
$ npm test
All 21 test suites passed successfully (including all 16 tests in leave_note_pdf_generation.test.mjs).

# 4. Real PostgreSQL 16 Security Test Suite (Port 54333)
$ npm run test:real-pg
All 14 Real PostgreSQL 16 Leave Note & RPC Security tests PASSED!
All 39 PostgreSQL 16 Attendance Correction checks PASSED!
All 22 PostgreSQL 16 Academic Materials Security checks PASSED!
All 8 Attendance Alert Integrity checks PASSED!
All 6 Announcement Security checks PASSED!
All 10 Rate Limiting checks PASSED!

# 5. Production Vite Build
$ npm run build
✓ built in 804ms (dist/ generated cleanly)
```

---

## 5. Deliverable Files

| File Path | Description |
| :--- | :--- |
| `src/services/leaveNotePdfService.ts` | Complete `pdf-lib` implementation with coordinate-calibrated overlay |
| `src/assets/templates/aietLeaveNoteTemplateBase64.ts` | 24.6 KB base64 encoded authoritative template binary |
| `public/templates/1000230720.pdf` | Authoritative template PDF in web public root |
| `src/assets/templates/1000230720.pdf` | Authoritative template PDF in source assets |
| `src/pages/LeaveRequestsPage.tsx` | Student UI handler with async `await downloadApprovedLeaveNote` |
| `src/hod/pages/HODLeaveDetail.tsx` | HOD UI handler with async `await downloadApprovedLeaveNote` |
| `tests/leave_note_pdf_generation.test.mjs` | 16 comprehensive unit tests validating security, single-page, and text |
| `scripts/generate_sample_leave_notes.mjs` | Sample PDF generator producing Scenarios A, B, and C |
| `scripts/create_comparison.py` | Visual side-by-side comparison generator comparing original with generated |
| `docs/audit/samples/original_vs_generated_comparison.png` | Side-by-side comparison proof of exact template preservation |
| `docs/audit/samples/comparison_scenario_a_complete_student.png` | Scenario A side-by-side comparison proof |
| `docs/audit/samples/comparison_scenario_b_missing_optional.png` | Scenario B side-by-side comparison proof |
| `docs/audit/samples/comparison_scenario_c_retroactive_backfill.png` | Scenario C side-by-side comparison proof |
| `docs/audit/MISSION_09_2_5_EXACT_ORIGINAL_LEAVE_NOTE_IMPLEMENTATION.md` | Authoritative audit report |

---

## 6. Conclusion & Verdict

Mission 09.2.5 has completely fulfilled the owner's non-negotiable requirement. The original physical AIET Leave Note form (`1000230720.pdf`) is preserved 100% intact, and student leave notes are generated with exact overlay alignment, strict security gating, and comprehensive visual verification.

**Final Verdict:** `EXACT ORIGINAL TEMPLATE IMPLEMENTED`
