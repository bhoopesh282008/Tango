"""Render docs/report.md to docs/report.pdf (A4) and print the page count.

    pipeline/.venv/Scripts/python docs/build_report.py

Needs the `markdown` package and Microsoft Edge or Chrome, which prints the
HTML to PDF in headless mode. The challenge limit is six pages.
"""
import re
import subprocess
import sys
from pathlib import Path

import markdown

DOCS = Path(__file__).parent
BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
]
PAGE_LIMIT = 6

CSS = """
@page { size: A4; margin: 18mm 17mm; }
body { font: 10.2pt/1.4 'Segoe UI', Arial, sans-serif; color: #111; }
h1 { font-size: 18pt; margin: 0 0 4pt; }
h2 { font-size: 13pt; margin: 13pt 0 4pt; break-after: avoid; }
p, ul { margin: 0 0 6pt; }
ul { padding-left: 16pt; }
li { margin-bottom: 2pt; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 9.2pt; break-inside: avoid; }
th, td { border: 0.5pt solid #999; padding: 2.5pt 5pt; text-align: left; vertical-align: top; }
th { background: #eee; }
blockquote { margin: 6pt 0; padding: 4pt 9pt; border-left: 3pt solid #999; background: #f4f4f4; }
blockquote p { margin: 0; }
code { font: 9.5pt Consolas, monospace; }
a { color: inherit; }
"""


def page_count(pdf):
    return len(re.findall(rb'/Type\s*/Page(?!s)', pdf.read_bytes()))


def main():
    body = markdown.markdown((DOCS / 'report.md').read_text(encoding='utf-8'), extensions=['tables'])
    html = DOCS / 'report.html'
    html.write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TANGO report</title>'
                    f'<style>{CSS}</style></head><body>{body}</body></html>', encoding='utf-8')
    browser = next((b for b in BROWSERS if Path(b).exists()), None)
    if not browser:
        sys.exit('Edge or Chrome not found; open docs/report.html and print it to PDF by hand.')
    pdf = DOCS / 'report.pdf'
    subprocess.run([browser, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', html.as_uri()], check=True, capture_output=True, timeout=120)
    html.unlink()
    pages = page_count(pdf)
    print(f'{pdf.name}: {pages} pages (limit {PAGE_LIMIT})')
    if pages > PAGE_LIMIT:
        sys.exit(1)


if __name__ == '__main__':
    main()
