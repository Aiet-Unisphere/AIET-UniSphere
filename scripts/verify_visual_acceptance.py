import os
import pymupdf

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples')

def inspect_sample(filename, expected_checks, label):
    pdf_path = os.path.join(samples_dir, filename)
    doc = pymupdf.open(pdf_path)
    assert len(doc) == 1, f"Expected 1 page, got {len(doc)}"
    page = doc[0]
    text = page.get_text()
    
    print(f"\n=======================================================")
    print(f"VERIFICATION: {label} ({filename})")
    print(f"=======================================================")
    print(f"Page size: {page.rect.width:.2f} x {page.rect.height:.2f} pt")
    
    # Check text items
    all_passed = True
    norm_text = " ".join(text.split())
    for desc, expected, should_exist in expected_checks:
        norm_expected = " ".join(expected.split())
        exists = norm_expected in norm_text
        status = "PASS" if (exists == should_exist) else "FAIL"
        if status == "FAIL":
            all_passed = False
        print(f"[{status}] {desc}: '{expected}' (expected: {'present' if should_exist else 'absent'}, found: {'present' if exists else 'absent'})")
        
    # Check drawings & bounding box limits
    drawings = page.get_drawings()
    max_x, max_y, min_x, min_y = 0, 0, 9999, 9999
    for d in drawings:
        r = d["rect"]
        min_x = min(min_x, r.x0)
        min_y = min(min_y, r.y0)
        max_x = max(max_x, r.x1)
        max_y = max(max_y, r.y1)
    
    print(f"\nDrawings bounding box: X=[{min_x:.1f}, {max_x:.1f}] pt, Y=[{min_y:.1f}, {max_y:.1f}] pt")
    print(f"Page boundary: [0, {page.rect.width:.1f}] x [0, {page.rect.height:.1f}] pt")
    
    # Margin check: 14mm is ~39.68pt
    assert min_x >= 35.0, f"Drawing clipped on left: {min_x}"
    assert max_x <= page.rect.width - 35.0, f"Drawing clipped on right: {max_x}"
    assert min_y >= 25.0, f"Drawing clipped on top: {min_y}"
    assert max_y <= page.rect.height - 25.0, f"Drawing clipped on bottom: {max_y}"
    print("[PASS] Outer margins respected, zero graphics clipped outside printable area.")
    
    return all_passed

# Scenario A checks
checks_a = [
    ("Institution Title", "ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY", True),
    ("Institutional Address", "Shobavana Campus, Mijar, Moodbidri, DK-574225", True),
    ("Phone & Fax", "Phone: 08258-262725, Fax: 08258-262726", True),
    ("Form Title", "STUDENT LEAVE NOTE / ON-DUTY (OD) FORM", True),
    ("Student Name", "Aditya Shenoy", True),
    ("USN", "4AL22CS015", True),
    ("Branch", "Computer Science and Engineering", True),
    ("Semester & Section", "Sem: 6", True),
    ("Section", "Sec: B", True),
    ("Academic Year", "2025-2026", True),
    ("Student Phone", "9876543210", True),
    ("Parent Phone", "9876543211", True),
    ("Leave Dates", "2026-11-12 to 2026-11-14 (3 Days)", True),
    ("Leave Reason", "VTU State-Level Hackathon 2026", True),
    ("HOD Approval Badge", "HOD APPROVED — DEMONSTRATION COPY", True),
    ("HOD Reviewer", "Dr. K. R. Sharma", True),
    ("HOD Remarks", "Full attendance credit granted upon certificate submission.", True),
    ("HOD Disclaimer", "SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL", True),
    ("Fictional Signature Tag", "[SAMPLE / DEMO SIGNATURE]", True),
    ("Fictional Seal Tag", "SAMPLE / DEMO SEAL", True),
    ("Watermark", "SYSTEM-GENERATED SAMPLE - NOT VALID AS AN OFFICIAL SIGNED FORM", True),
    ("Submission Provenance", "Provenance: Verified Submission Snapshot", True),
    ("Single Page Indicator", "Page 1 of 1", True),
    ("No NAAC claim", "NAAC", False)
]

# Scenario B checks (missing optional: section, parent phone)
checks_b = [
    ("Student Name", "Pooja Hegde", True),
    ("USN", "4AL23IS042", True),
    ("Branch", "Information Science and Engineering", True),
    ("Semester", "Sem: 4", True),
    ("Missing Section handled safely", "Sec: -", True),
    ("Student Phone", "9845123456", True),
    ("Missing Parent Phone handled safely", "8. Parent Contact", True),
    ("Parent Phone Value Is Dash", "-\n", True),
    ("Medical Leave Reason", "Severe viral fever", True),
    ("HOD Reviewer", "Dr. Ramesh Shetty", True),
    ("Medical HOD Remarks", "Please submit fitness certificate", True),
    ("Submission Provenance", "Provenance: Verified Submission Snapshot", True),
    ("Single Page Indicator", "Page 1 of 1", True)
]

# Scenario C checks (retroactive backfill)
checks_c = [
    ("Student Name", "Naveen Kumar", True),
    ("USN", "4AL21ME078", True),
    ("Branch", "Mechanical Engineering", True),
    ("Semester", "Sem: 7", True),
    ("Section", "Sec: A", True),
    ("Reason", "VTU sponsored CNC machine workshop", True),
    ("HOD Reviewer", "Prof. M. B. Patil", True),
    ("Retroactive Provenance Footer", "Provenance: Retroactive Backfill (Current Profile)", True),
    ("Does NOT claim Verified Submission Snapshot", "Provenance: Verified Submission Snapshot", False),
    ("Single Page Indicator", "Page 1 of 1", True)
]

pass_a = inspect_sample('scenario_a_complete_student.pdf', checks_a, 'Scenario A: Complete Student Info')
pass_b = inspect_sample('scenario_b_missing_optional.pdf', checks_b, 'Scenario B: Missing Optional Info')
pass_c = inspect_sample('scenario_c_retroactive_backfill.pdf', checks_c, 'Scenario C: Retroactive Backfill')

if pass_a and pass_b and pass_c:
    print("\n=======================================================")
    print("ALL VISUAL ACCEPTANCE CHECKS PASSED FOR ALL 3 SCENARIOS!")
    print("=======================================================\n")
else:
    raise SystemExit("Visual acceptance checks failed.")
