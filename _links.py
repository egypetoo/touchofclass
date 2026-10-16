import re
from pathlib import Path

root = Path(r"D:\Design\Touch of class")
ids = {
    "فيلا الشيخ زايد": "villa-zayed",
    "لوفت معاصر": "loft",
    "بنتهاوس": "penthouse",
    "مكتب العاصمة": "capital-office",
    "إقامة شرقية": "east",
    "بيت البحيرة": "lake",
    "تجديد منزل": "renovation",
    "فيلا دالاس": "dallas",
    "أبراج سكنية": "towers",
    "أناقة هادئة": "elegance",
    "حياة المدينة": "city",
    "جناح بروكلين": "brooklyn",
    "جناح سكني": "brooklyn",
    "مكتب معاصر": "capital-office",
    "تفاصيل مخصصة": "east",
    "تشطيب متكامل": "renovation",
    "تصميم داخلي": "loft",
    "تخطيط معماري": "towers",
    "إدارة تنفيذ": "capital-office",
}
for path in root.rglob("*"):
    if path.suffix.lower() not in {".html", ".js"} or not path.is_file():
        continue
    text = path.read_text(encoding="utf-8")
    if "project-details.html" not in text:
        continue
    text = text.replace('href="./project-details.html"', 'href="./projects.html"')

    def anchor(match):
        name = match.group(2)
        slug = ids.get(name)
        href = "./projects.html" + (("#" + slug) if slug else "")
        return 'href="' + href + '"' + match.group(1) + ">" + name

    text = re.sub(
        r'href="\./projects\.html"([^>]*)>([^<]+)',
        anchor,
        text,
    )
    path.write_text(text, encoding="utf-8")
    print(path.name)
