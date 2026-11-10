import os
import fitz
import numpy as np
from PIL import Image

template_pdf = os.path.join(os.path.dirname(__file__), '..', 'public', 'templates', '1000230720.pdf')
app_pdf = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples', 'scenario_student_application.pdf')
approved_pdf = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples', 'scenario_approved_leave_note.pdf')

orig_doc = fitz.open(template_pdf)
app_doc = fitz.open(app_pdf)
appr_doc = fitz.open(approved_pdf)

print("=" * 60)
print("FORENSIC LEAVE NOTE OVERLAY & TEMPLATE FIDELITY VERIFICATION")
print("=" * 60)

# 1. Page dimensions verification
orig_page = orig_doc[0]
app_page = app_doc[0]
appr_page = appr_doc[0]

print(f"Original PDF Page Dimensions: {orig_page.rect.width:.1f} x {orig_page.rect.height:.1f} pt")
print(f"Application PDF Dimensions:  {app_page.rect.width:.1f} x {app_page.rect.height:.1f} pt")
print(f"Approved Note Dimensions:    {appr_page.rect.width:.1f} x {appr_page.rect.height:.1f} pt")

assert orig_page.rect.width == 595.0 and orig_page.rect.height == 842.0, "Original must be A4"
assert app_page.rect.width == 595.0 and app_page.rect.height == 842.0, "Application must be exact A4"
assert appr_page.rect.width == 595.0 and appr_page.rect.height == 842.0, "Approved note must be exact A4"
print("✓ Page dimensions check: PASS (100% exact 595.0 x 842.0 pt A4 match)")

# 2. Page count check
assert len(orig_doc) == 1, "Original must be exactly 1 page"
assert len(app_doc) == 1, "Application must be exactly 1 page"
assert len(appr_doc) == 1, "Approved note must be exactly 1 page"
print("✓ Single page constraint: PASS (All documents strictly 1 page)")

# 3. Text Overlay Position Analysis
def extract_text_spans(page):
    blocks = page.get_text("blocks")
    return blocks

print("\n--- Student Application PDF Text Overlays ---")
app_blocks = extract_text_spans(app_page)
for b in app_blocks:
    # b: (x0, y0, x1, y1, text, block_no, block_type)
    text = b[4].strip()
    if text:
        y_from_bottom = 842.0 - b[1]
        print(f"  Pos: x={b[0]:.1f}, y={b[1]:.1f} (y_bottom={y_from_bottom:.1f}) | '{text[:40]}'")

# 4. Check that remarks sections in Student Application are clean
# Coordinate in PDF points (top-down in PyMuPDF: y=0 is top, y=842 is bottom)
# Mentor: y_bottom in [355, 406] => y_top in [436, 487]
# Coordinator: y_bottom in [307, 351] => y_top in [491, 535]
# HOD: y_bottom in [255, 305] => y_top in [537, 587]
# Principal: y_bottom in [197, 236] => y_top in [606, 645]
# SWO: y_bottom in [137, 180] => y_top in [662, 705]

def get_text_in_rect(page, rect):
    text = page.get_text("text", clip=rect).strip()
    return text

# In application PDF, HOD box must be completely blank
hod_rect = fitz.Rect(80, 842 - 305, 520, 842 - 255) # y: 255 to 305 from bottom => 537 to 587 from top
hod_text_app = get_text_in_rect(app_page, hod_rect)
print(f"\nApplication PDF text in HOD remarks area: '{hod_text_app}'")
assert hod_text_app == "", "Application PDF must have zero text in HOD remarks area"
print("✓ Application PDF HOD area clean: PASS")

# In approved PDF, HOD box must contain remarks and endorsement
hod_text_appr = get_text_in_rect(appr_page, hod_rect)
print(f"Approved PDF text in HOD remarks area:\n  {hod_text_appr.replace(chr(10), ' | ')}")
assert "HOD APPROVED" in hod_text_appr, "Approved PDF must contain HOD endorsement"
print("✓ Approved PDF HOD endorsement bounded: PASS")

# Check Mentor area in both PDFs
mentor_rect = fitz.Rect(80, 842 - 406, 520, 842 - 355)
mentor_text_app = get_text_in_rect(app_page, mentor_rect)
mentor_text_appr = get_text_in_rect(appr_page, mentor_rect)
assert mentor_text_app == "" and mentor_text_appr == "", "Mentor remarks must remain 100% blank"
print("✓ Mentor remarks area blank in both PDFs: PASS")

# Check Principal area in both PDFs
principal_rect = fitz.Rect(80, 842 - 236, 520, 842 - 197)
assert get_text_in_rect(app_page, principal_rect) == "" and get_text_in_rect(appr_page, principal_rect) == "", "Principal remarks must remain blank"
print("✓ Principal remarks area blank in both PDFs: PASS")

# Check SWO / Warden area in both PDFs
swo_rect = fitz.Rect(80, 842 - 180, 520, 842 - 137)
assert get_text_in_rect(app_page, swo_rect) == "" and get_text_in_rect(appr_page, swo_rect) == "", "SWO remarks must remain blank"
print("✓ SWO / Warden remarks area blank in both PDFs: PASS")

# 5. Image Pixel Diff on Background Regions
pix_orig = orig_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
pix_app = app_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
pix_appr = appr_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))

arr_orig = np.frombuffer(pix_orig.samples, dtype=np.uint8).reshape((pix_orig.height, pix_orig.width, 3))
arr_app = np.frombuffer(pix_app.samples, dtype=np.uint8).reshape((pix_app.height, pix_app.width, 3))
arr_appr = np.frombuffer(pix_appr.samples, dtype=np.uint8).reshape((pix_appr.height, pix_appr.width, 3))

# Check institutional header region (y: 0 to 300 in 2x matrix => top 150 pt)
header_orig = arr_orig[0:300, 0:pix_orig.width]
header_app = arr_app[0:300, 0:pix_app.width]
header_appr = arr_appr[0:300, 0:pix_appr.width]

diff_app_header = np.abs(header_orig.astype(int) - header_app.astype(int)).max()
diff_appr_header = np.abs(header_orig.astype(int) - header_appr.astype(int)).max()

print(f"\nHeader max pixel diff (Application vs Original): {diff_app_header}")
print(f"Header max pixel diff (Approved vs Original):    {diff_appr_header}")
assert diff_app_header == 0, "Header must be bitwise identical"
assert diff_appr_header == 0, "Header must be bitwise identical"
print("✓ Institutional Header & Logo unmodified: PASS")

# Check Printed Notes region at bottom (y: 1440 to 1580 in 2x matrix => notes 1-4)
notes_orig = arr_orig[1440:1580, 60:pix_orig.width-60]
notes_app = arr_app[1440:1580, 60:pix_app.width-60]
notes_appr = arr_appr[1440:1580, 60:pix_appr.width-60]

diff_app_notes = np.abs(notes_orig.astype(int) - notes_app.astype(int)).max()
diff_appr_notes = np.abs(notes_orig.astype(int) - notes_appr.astype(int)).max()

print(f"Printed Notes 1-4 max pixel diff (Application vs Original): {diff_app_notes}")
print(f"Printed Notes 1-4 max pixel diff (Approved vs Original):    {diff_appr_notes}")
assert diff_app_notes == 0, "Printed Notes must be bitwise identical"
assert diff_appr_notes == 0, "Printed Notes must be bitwise identical"
print("✓ Original printed mess-reduction notes 1-4 unmodified: PASS")

print("\n" + "=" * 60)
print("ALL FORENSIC VERIFICATIONS PASSED SUCCESSFULLY!")
print("=" * 60)
