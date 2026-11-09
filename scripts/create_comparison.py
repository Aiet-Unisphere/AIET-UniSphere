import os
import fitz
from PIL import Image, ImageDraw, ImageFont

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'docs', 'audit', 'samples')
orig_img_path = os.path.join(samples_dir, 'original_template_extracted.png')
orig = Image.open(orig_img_path).convert('RGB')

scenarios = [
    ('scenario_a_complete_student', 'Scenario A — Complete Student Details & HOD Remarks'),
    ('scenario_b_missing_optional', 'Scenario B — Missing Optional Section & Parent Phone'),
    ('scenario_c_retroactive_backfill', 'Scenario C — Retroactive Backfill Provenance')
]

for filename, title in scenarios:
    pdf_path = os.path.join(samples_dir, f"{filename}.pdf")
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
    preview_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

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
    draw.text((30, 45), "Authoritative Blank Source: 1000230720.pdf (595 x 842 pt)", fill=(148, 163, 184))

    right_x = orig.width + 30
    draw.text((right_x + 10, 20), f"AUTOMATICALLY GENERATED LEAVE NOTE: {title.upper()}", fill=(255, 255, 255))
    draw.text((right_x + 10, 45), "Exact Template Preservation with Programmatic Overlay & Fictional HOD Endorsement", fill=(125, 211, 252))

    # Paste pages
    comp.paste(orig, (0, banner_height))
    comp.paste(preview_img, (orig.width + 30, banner_height))

    # Vertical divider
    draw.line([(orig.width + 15, 0), (orig.width + 15, comp_h)], fill=(203, 213, 225), width=2)

    out_path = os.path.join(samples_dir, f"comparison_{filename}.png")
    comp.save(out_path)
    print(f"Generated comparison: {out_path} ({comp_w}x{comp_h})")

# Also update the primary comparison image
primary_comp = os.path.join(samples_dir, 'original_vs_generated_comparison.png')
scenario_a_comp = os.path.join(samples_dir, 'comparison_scenario_a_complete_student.png')
Image.open(scenario_a_comp).save(primary_comp)
print(f"Updated primary comparison: {primary_comp}")
