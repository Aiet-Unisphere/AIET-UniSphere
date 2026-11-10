import os
import fitz
from PIL import Image, ImageDraw, ImageFont

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples')
template_pdf_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'templates', '1000230720.pdf')

# Extract high-res original template image directly from template PDF
orig_doc = fitz.open(template_pdf_path)
orig_page = orig_doc[0]
orig_pix = orig_page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
orig = Image.frombytes("RGB", [orig_pix.width, orig_pix.height], orig_pix.samples)

orig_img_path = os.path.join(samples_dir, 'original_template_extracted.png')
orig.save(orig_img_path)
print(f"Saved extracted original template image: {orig_img_path} ({orig.width}x{orig.height})")

scenarios = [
    ('scenario_a_complete_student', 'Scenario A — Complete Student Details & HOD Remarks (Approved Note)'),
    ('scenario_b_missing_optional', 'Scenario B — Missing Optional Section & Parent Phone (Approved Note)'),
    ('scenario_c_retroactive_backfill', 'Scenario C — Retroactive Backfill Provenance (Approved Note)'),
    ('scenario_student_application', 'Scenario Student Application — Student Application Form (Pre-Approval Blank Remarks)'),
    ('scenario_approved_leave_note', 'Scenario Approved Note — Official Approved Leave Note (HOD Endorsement)')
]

for filename, title in scenarios:
    pdf_path = os.path.join(samples_dir, f"{filename}.pdf")
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
    preview_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    # Save standalone rendered page image
    rendered_png_path = os.path.join(samples_dir, f"{filename}.png")
    preview_img.save(rendered_png_path)

    # Canvas dimensions with header banner
    banner_height = 80
    comp_w = orig.width + preview_img.width + 30
    comp_h = max(orig.height, preview_img.height) + banner_height
    comp = Image.new('RGB', (comp_w, comp_h), (245, 247, 250))
    draw = ImageDraw.Draw(comp)

    # Draw header banners
    draw.rectangle([(0, 0), (comp_w, banner_height)], fill=(26, 32, 44))
    
    # Simple text banners
    draw.text((30, 20), "ORIGINAL PHYSICAL AIET LEAVE FORM TEMPLATE", fill=(203, 213, 225))
    draw.text((30, 45), "Authoritative Blank Source: 1000230720.pdf / 1000230720(2).pdf (595 x 842 pt)", fill=(148, 163, 184))

    right_x = orig.width + 30
    draw.text((right_x + 10, 20), f"AUTOMATICALLY GENERATED: {title.upper()}", fill=(255, 255, 255))
    draw.text((right_x + 10, 45), "Exact Template Preservation with Programmatic Overlay onto Blank Baselines", fill=(125, 211, 252))

    # Paste pages
    comp.paste(orig, (0, banner_height))
    comp.paste(preview_img, (orig.width + 30, banner_height))

    # Vertical divider
    draw.line([(orig.width + 15, 0), (orig.width + 15, comp_h)], fill=(203, 213, 225), width=2)

    out_path = os.path.join(samples_dir, f"comparison_{filename}.png")
    comp.save(out_path)
    print(f"Generated comparison: {out_path} ({comp_w}x{comp_h})")

# Update primary comparison image
primary_comp = os.path.join(samples_dir, 'original_vs_generated_comparison.png')
approved_comp = os.path.join(samples_dir, 'comparison_scenario_approved_leave_note.png')
Image.open(approved_comp).save(primary_comp)
print(f"Updated primary comparison: {primary_comp}")
