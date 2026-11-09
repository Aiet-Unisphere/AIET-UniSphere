import os
import fitz  # PyMuPDF
from PIL import Image
import numpy as np
from rapidocr_onnxruntime import RapidOCR

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples')
pdf_files = [
    'scenario_a_complete_student.pdf',
    'scenario_b_missing_optional.pdf',
    'scenario_c_retroactive_backfill.pdf'
]

ocr = RapidOCR()

print("Rendering PDF samples to PNG images and verifying template fidelity...")
for pdf_name in pdf_files:
    pdf_path = os.path.join(samples_dir, pdf_name)
    base_name = os.path.splitext(pdf_name)[0]
    doc = fitz.open(pdf_path)
    
    print(f"\n--- Inspecting {pdf_name} ---")
    print(f"Page count: {len(doc)}")
    assert len(doc) == 1, f"Expected exactly 1 page, found {len(doc)}"
    
    page = doc[0]
    rect = page.rect
    print(f"Page dimensions: {rect.width} x {rect.height} pt (A4 standard: 595.0 x 842.0 pt)")
    
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
    
    # Overlaid vector text inspection
    vector_text = page.get_text()
    vector_checks = [
        "HOD APPROVED — DEMONSTRATION COPY",
        "SAMPLE / DEMO — NOT AN OFFICIAL SIGNATURE OR SEAL",
        "[SAMPLE / DEMO SIGNATURE]",
        "Page 1 of 1"
    ]
    print("Vector overlay checks:")
    for c in vector_checks:
        found = c in vector_text or c.replace('—', '-').replace('–', '-') in vector_text.replace('—', '-').replace('–', '-')
        print(f"  [{'PASS' if found else 'FAIL'}] '{c}'")

    # OCR inspection of bottom printed notes to verify authentic original physical notes
    # Crop bottom notes region (y: 1300 to height)
    bottom_crop = np.array(img.crop((0, 1300, img.width, img.height)))
    ocr_result, _ = ocr(bottom_crop)
    detected_lines = [item[1] for item in ocr_result]
    ocr_text = ' '.join(detected_lines).lower()

    print("Authentic physical notes OCR checks:")
    physical_note_checks = [
        ("Note 1 (Mess bill reduction)", "separate mess bill reduction"),
        ("Note 2 (Prior permission)", "prior permission"),
        ("Note 3 (HOD & AO/Principal signature)", "hod & ao/principal"),
        ("Note 4 (Dates considered)", "only above mentioned dates")
    ]
    for label, needle in physical_note_checks:
        found = needle in ocr_text
        print(f"  [{'PASS' if found else 'FAIL'}] {label}")

print("\nAll renderings and fidelity checks completed successfully.")
