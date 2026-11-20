# Build a copy of the demo page whose legal registry has an analytics script and marketing consent switched on.
import json, re, sys
src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf8').read()
m = re.search(r'(<script type="application/json" id="legalBundle">)(.*?)(</script>)', html, re.S)
bundle = json.loads(m.group(2).replace('<\\/', '</'))
reg = json.loads(bundle['legal.json'])
for cat in reg['cookies']['categories']:
    if cat['id'] == 'analytics':
        cat['items'] = [{'name': '_test_an', 'what': 'מזהה ניתוח', 'why': 'סופר ביקורים באתר', 'kept': 'שנה', 'cookie': True}]
        cat['scripts'] = [{'src': 'https://analytics.example/a.js', 'attrs': {'data-site': 'sadran'}}]
for c in reg['consents']:
    if c['id'] == 'marketing':
        c['enabled'] = True
        c['audience'] = ['manager', 'employee']
bundle['legal.json'] = json.dumps(reg, ensure_ascii=False)
biz = json.loads(bundle['business.json']); biz['BUSINESS_NAME'] = 'מרכול השכונה בע״מ'; biz['ACCESSIBILITY_EMAIL'] = ''; bundle['business.json'] = json.dumps(biz, ensure_ascii=False)
html = html[:m.start(2)] + json.dumps(bundle, ensure_ascii=False).replace('</', '<\\/') + html[m.end(2):]
open(out, 'w', encoding='utf8').write(html)
print('variant written')
