import os
import fitz  # PyMuPDF
from PIL import Image

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples')
pdf_files = [
    'scenario_a_complete_student.pdf',
    'scenario_b_missing_optional.pdf',
    'scenario_c_retroactive_backfill.pdf'
]

print("Rendering PDF samples to PNG images...")
for pdf_name in pdf_files:
    pdf_path = os.path.join(samples_dir, pdf_name)
    base_name = os.path.splitext(pdf_name)[0]
    doc = fitz.open(pdf_path)
    
    print(f"\n--- Inspecting {pdf_name} ---")
    print(f"Page count: {len(doc)}")
    assert len(doc) == 1, f"Expected exactly 1 page, found {len(doc)}"
    
    page = doc[0]
    rect = page.rect
    print(f"Page dimensions: {rect.width} x {rect.height} pt (A4 standard: 595.28 x 841.89 pt)")
    
    # Render at 2x resolution (144 dpi) for crisp viewing
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    
    png_path = os.path.join(samples_dir, f"{base_name}.png")
    pix.save(png_path)
    print(f"Saved PNG preview: {png_path} ({pix.width}x{pix.height})")
    
    # Also create a grayscale test preview to verify readability in grayscale print
    img = Image.open(png_path)
    gray_img = img.convert('L')
    gray_path = os.path.join(samples_dir, f"{base_name}_grayscale.png")
    gray_img.save(gray_path)
    print(f"Saved Grayscale preview: {gray_path}")
    
    # Text inspection
    text = page.get_text()
    print("Key text check:")
    checks = [
        "ALVA'S INSTITUTE OF ENGINEERING & TECHNOLOGY",
        "Shobavana Campus, Mijar, Moodbidri, DK-574225",
        "Phone: 08258-262725, Fax: 08258-262726",
        "STUDENT LEAVE NOTE / ON-DUTY (OD) FORM",
        "HOD APPROVED — DEMONSTRATION COPY",
        "SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL",
        "SYSTEM-GENERATED SAMPLE - NOT VALID AS AN OFFICIAL SIGNED FORM",
        "Page 1 of 1"
    ]
    for c in checks:
        found = c in text
        print(f"  [{'PASS' if found else 'FAIL'}] '{c}'")
        if not found:
            # Check with normalized hyphens/dashes
            alt_c = c.replace('—', '-').replace('–', '-')
            if alt_c in text.replace('—', '-').replace('–', '-'):
                print(f"     (Matched with dash normalization)")

print("\nAll renderings completed successfully.")
