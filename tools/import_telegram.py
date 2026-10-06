"""lessons.json (from tools/telegram_lessons.py) -> site/data/library.json.

Lessons that still carry a review flag (no title, another speaker, ...) are left out until a person fixes them;
corrections go in data/telegram_overrides.json: {"<lesson id>": {"title": "...", "series": "<id>", "publish": true|false}}.
"""
import json, os, sys, collections

sys.path.insert(0, os.path.dirname(__file__))
from telegram_lessons import SERIES  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TELEGRAM_EXPORTS', 'telegram'), 'lessons.json')
lessons = json.load(open(src, encoding='utf-8'))
ov_path = os.path.join(ROOT, 'data', 'telegram_overrides.json')
overrides = json.load(open(ov_path, encoding='utf-8')) if os.path.exists(ov_path) else {}
meta = {sid: (title, sec) for sid, title, sec, _ in SERIES}
meta['misc'] = ('دروس ومحاضرات متفرقة', 'lectures')
MERGE = {'misc': 'lectures'}     # 2026-10-06 (owner): the one-off talks and «محاضرات وكلمات» are one series

out_lessons, skipped = [], collections.Counter()
for l in lessons:
    o = overrides.get(l['id'], {})
    if o.get('title'): l['title'], l['flags'] = o['title'], [f for f in l['flags'] if f not in ('no title', 'no series')]
    if o.get('series'): l['series'], l['flags'] = o['series'], [f for f in l['flags'] if f != 'no series']
    publish = o.get('publish', not l['flags'])
    if not publish or l['series'] not in meta:
        skipped['flagged' if l['flags'] else 'excluded'] += 1
        continue
    l['series'] = MERGE.get(l['series'], l['series'])
    hd = l.get('hijri') or ''
    out_lessons.append({k: v for k, v in {
        'id': l['id'], 'title': l['title'], 'series': l['series'], 'kind': 'audio',
        'src': '',                                   # filled by tools/mirror_media.py once the audio is in R2
        'tg': l['posts'][0], 'hd': hd, 'date': l['date'],
        'duration': int(round(l['duration_min'] * 60)) if l.get('duration_min') and l.get('duration_exact') else 0,
    }.items() if v not in ('', None) or k == 'src'})

used = collections.Counter(l['series'] for l in out_lessons)
series = [{'id': sid, 'title': meta[sid][0], 'sec': meta[sid][1]} for sid in meta if used[sid]]
lib = {'series': series, 'lessons': out_lessons, 'books': []}
json.dump(lib, open(os.path.join(ROOT, 'site', 'data', 'library.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"{len(out_lessons)} lessons in {len(series)} series -> site/data/library.json; left out: {dict(skipped)}")
