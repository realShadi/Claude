#!/usr/bin/env python3
"""Build the single-file demo of Sadran for the Claude viewer.

The real site is the site/ folder and needs no build. The Claude viewer shows one HTML file and
blocks outside connections, so this script folds the styles, the script and the legal texts into
one page. There it runs as a one-device demo with example data.

    python3 tools/build-demo.py out.html
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'site'
# The page skeleton the viewer expects, unchanged.
SKELETON = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,'
            'initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;'
            'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px '
            '-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}'
            '[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>')
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:'
         'wght@400;500;600;700&family=Secular+One&display=swap">')


def main(out):
    html = (ROOT / 'index.html').read_text(encoding='utf8')
    css = (ROOT / 'app.css').read_text(encoding='utf8')
    js = (ROOT / 'app.js').read_text(encoding='utf8')
    # The demo takes its fonts from Google Fonts, the only font host the viewer allows.
    css = re.sub(r'/\* fonts:start.*?/\* fonts:end \*/\n', '', css, flags=re.S)
    body = html[html.index('<body>') + len('<body>'):html.index('<noscript>')].strip()
    title = re.search(r'<title>.*?</title>', html, re.S).group(0)
    legal_dir = ROOT / 'content' / 'legal'
    bundle = ''
    if legal_dir.is_dir():
        # The texts and the registry; the folder's own README is for people editing them.
        files = {f.name: f.read_text(encoding='utf8') for f in sorted(legal_dir.iterdir())
                 if f.suffix in ('.json', '.md') and f.name != 'README.md'}
        # "</" must not appear inside a script element.
        bundle = '<script type="application/json" id="legalBundle">' + json.dumps(files, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'
    assert '</script' not in js.lower(), 'app.js must not contain a closing script tag'
    page = '\n'.join([
        SKELETON,
        '<meta name="claude:viewport-fit-sides" content="cover">',
        title,
        FONTS,
        '<style>\n' + css + '</style>',
        '',
        body,
        '',
        bundle + '<script>\n' + js + '</script>',
        '',
        '</body></html>',
        '',
    ])
    Path(out).write_text(page, encoding='utf8')
    print('wrote', out, len(page.encode('utf8')), 'bytes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
