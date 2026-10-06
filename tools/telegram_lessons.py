"""Merge the two Telegram exports into one de-duplicated lesson list.

Reads  $TELEGRAM_EXPORTS/{jabiri,jabrih,aljabri013}/result.json (Telegram Desktop JSON exports; a missing one is skipped)
Writes $TELEGRAM_EXPORTS/lessons.json (input of tools/import_telegram.py)
"""
import json, os, re, collections, unicodedata
from datetime import datetime

ROOT = os.environ.get('TELEGRAM_EXPORTS', 'telegram')   # folder with jabiri/result.json and jabrih/result.json
CHANNELS = ['jabiri', 'jabrih', 'aljabri013']   # jabiri (official) wins when a file is in both
QA_CHANNEL = 'aljabri013'                 # «أسئلة وأجوبة»: a question post, then the Sheikh's answer (audio, or a link to it)
SHEIKH_CHANNELS = {'قناة فضيلة الشيخ يحيى الجابري الرسمية',
                   'قناة الشيخ : يحيى بن أحمد الجابري حفظه الله الثانية',
                   'يحي بن أحمد الجابري'}
OTHER_SCHOLARS = ['الفوزان', 'ابن باز', 'بن باز', 'العثيمين', 'ابن عثيمين', 'الألباني', 'المدخلي',
                  'ربيع بن هادي', 'عبيد الجابري', 'البخاري حفظه', 'السحيمي', 'اللحيدان', 'آل الشيخ', 'مفتي']

# (series id, title, section, pattern) — first match wins, so specific before general. Patterns use \\s* between words
# because the sources often drop or add a space («فتحالمجيد», «مجا لس»). Reorganised 2026-10-06 after the team's review:
# every book read to the Sheikh is its own series, and the أبواب of كتاب التوحيد and the صلوات go where they belong.
SERIES = [
    # a title that starts with «صلاة …» is a recitation, whatever else the post mentions
    ('tilawa',      'تلاوات',                         'tilawa',  r'^\s*(?:ص|صلا|صلاة|صلاه|صلأة|صااة|يصلاة)\s*(?:ال|أل)?(?:فجر|فجري|عشاء|تهجد|قيام|تراويح|مغرب)'),
    ('khutab',      'خطب الجمعة',                     'khutab',  r'^\s*(?:مقتطف\s*من\s*)?(?:خطبة|خطبتا|خطبتي|خطبه|خطب\b)'),   # a khutba is a khutba, whatever its subject
    ('ibn-kathir',  'تفسير ابن كثير',                 'tafsir',  r'ابن\s*كثير|بن\s*كثير'),
    ('saadi',       'تفسير ابن سعدي',                 'tafsir',  r'سعدي'),
    ('shawkani',    'التعليق على تفسير الشوكاني',     'tafsir',  r'الشوكاني|فتح\s*القدير'),
    ('tafsir',      'دروس في التفسير',                'tafsir',  r'تفسير'),
    ('musnad',      'شرح مسند الإمام أحمد',           'hadith',  r'مسند'),
    ('bukhari',     'شرح صحيح البخاري',               'hadith',  r'البخاري|بخاري|من\s*صحيح(?!\s*م)'),   # «كتاب التوحيد من صحيح [البخاري]»
    ('muslim',      'شرح صحيح مسلم',                  'hadith',  r'صحيح مسلم|ص مسلم|ش مسلم|درس مسلم|\bمسلم\b|صحيح م\b|صحيح م\s*\d'),
    ('riyad',       'شرح رياض الصالحين',              'hadith',  r'رياض'),
    ('bulugh',      'شرح بلوغ المرام',                'hadith',  r'بلوغ'),
    ('arbain',      'شرح الأربعين النووية',           'hadith',  r'الاربعين|الأربعين|الأربعون|الاربعون'),
    ('umdah',       'شرح عمدة الأحكام',               'hadith',  r'عمدة'),
    ('sunan',       'شرح السنن',                      'hadith',  r'سنن'),
    ('jihad',       'شرح كتاب الجهاد',                'hadith',  r'الجهاد'),
    # the شروح of كتاب التوحيد, each on its own
    ('qawl-mufid',  'التعليق على القول المفيد',       'aqeedah', r'القول\s*المفيد'),
    ('qawl-sadid',  'التعليق على القول السديد',       'aqeedah', r'القول\s*السديد'),
    ('fath-majid',  'التعليق على فتح المجيد',         'aqeedah', r'فتح\s*المجيد'),
    ('taysir',      'التعليق على تيسير العزيز الحميد','aqeedah', r'تيسير\s*العزيز'),
    ('ianat',       'التعليق على إعانة المستفيد',     'aqeedah', r'[إا]عانة\s*المستفيد'),
    ('fath-tasdid', 'التعليق على الفتح والتسديد',     'aqeedah', r'الفتح\s*والتسديد'),
    ('mujaz',       'التعليق على الشرح الموجز الممهد','aqeedah', r'الشرح\s*الموجز|الموجز\s*الممهد'),
    # fiqh books
    ('mulakhkhas',  'التعليق على الملخص الفقهي',      'fiqh',    r'الملخص'),
    ('manar',       'التعليق على منار السبيل',        'fiqh',    r'منار\s*السبيل'),
    ('hajj',        'دروس الحج والعمرة',              'fiqh',    r'دليل\s*الحاج|مناسك\s*الحج|[اأ]حكام\s*الحج|الحج\s*والعمرة|صفة\s*الحج\s*والعمرة|التحقيق\s*وال[إا]يضاح'),
    ('shurut-salah','شروط الصلاة وأركانها وواجباتها', 'fiqh',    r'شروط\s*الصلاة'),
    ('adab-mashi',  'آداب المشي إلى الصلاة',          'fiqh',    r'[آأا]داب\s*المشي'),
    # books and متون of عقيدة, each on its own (the team: «وكل كتاب مستقل»)
    ('usul',        'شرح الأصول الثلاثة',             'aqeedah', r'الاصول\s*الثلاث|الأصول\s*الثلاث|الاصل\s|الأصل\s|الاصل$|الأصل$'),
    ('usul-sitta',  'شرح الأصول الستة',               'aqeedah', r'الاصول\s*الستة|الأصول\s*الستة'),
    ('qawaid',      'شرح القواعد الأربع',             'aqeedah', r'القواعد'),
    ('nawaqid',     'شرح نواقض الإسلام',              'aqeedah', r'نواقض'),
    ('kashf',       'شرح كشف الشبهات',                'aqeedah', r'كشف\s*الشبهات'),
    ('lumah',       'شرح لمعة الاعتقاد',              'aqeedah', r'لمعة'),
    ('masail',      'شرح مسائل الجاهلية',             'aqeedah', r'مسائل\s*الجاهلية'),
    ('tadmuriyya',  'شرح الرسالة التدمرية',           'aqeedah', r'التدمرية'),
    ('durar',       'الدرر السنية من الفتاوى النجدية','aqeedah', r'الدرر\s*السنية|الدرر\s*المجلس|الدرر\s*رقم'),
    ('qayrawaniyya','التعليق على العقيدة القيروانية', 'aqeedah', r'القيرواني|الاستعانة\s*برب'),
    ('muzani',      'شرح السنة للمزني',               'aqeedah', r'مزني'),
    ('fadl-islam',  'قراءة كتاب فضل الإسلام',         'aqeedah', r'(?:كتا\s*ب|كتاب|قراءة|شرح)\s*فضل\s*ال[إا]سلام'),
    ('ghunya',      'غنية السائل في لامية شيخ الإسلام','aqeedah', r'غنية\s*السائل|لامية\s*شيخ'),
    ('subul',       'منظومة السبل السوية',            'aqeedah', r'السبل\s*السوية'),
    ('talbis',      'الرد على تلبيس الصوفية',         'aqeedah', r'تلبيس\s*الصوفية'),
    ('wabil',       'شرح الوابل الصيب',               'aqeedah', r'الوابل\s*الصيب'),
    ('tabarruk',    'قراءة كتاب التبرك أحكام وشبهات', 'aqeedah', r'التبرك\s*[أا]حكام'),
    ('furqan',      'قراءة كتاب الفرقان',             'aqeedah', r'كتاب\s*الفرقان'),
    ('iman-salam',  'كتاب الإيمان لأبي عبيد',         'aqeedah', r'الإيمان\s*لأبي\s*عبيد|القاسم\s*بن\s*سلام'),
    ('bishr',       'عقيدة بشر الحافي',               'aqeedah', r'بشر\s*الحافي'),
    ('haiyya',      'القصيدة الحائية لابن أبي داود',  'aqeedah', r'القصيدة\s*الحائي'),
    ('shafii',      'إثبات الصفات للشافعي',           'aqeedah', r'الصفات\s*للشافعي|اعتقاد\s*الشافعي'),
    ('qasida-sunna','قصيدة في السنة',                 'aqeedah', r'قصيدة\s*في\s*السنة'),
    ('mujmal',      'مجمل اعتقاد أهل السنة',          'aqeedah', r'مجمل\s*اعتقاد'),
    ('majishun',    'إثبات الصفات والرؤية والرد على الجهمية', 'aqeedah', r'الماجشون|[إا]ثبات\s*الصفا?[تة]\s*والرؤية'),
    ('ittiba',      'اتباع الصحابة',                  'aqeedah', r'اتباع\s*الصحابة'),
    ('qadar',       'إثبات القدر',                    'aqeedah', r'[إا]ثبات\s*القدر'),
    ('tawhid-ibada','رسالة في توحيد العبادة',         'aqeedah', r'توحيد\s*العبادة'),
    ('tathir',      'تطهير الاعتقاد',                 'aqeedah', r'تطهير\s*الاعتقاد'),
    ('tathir-jinan','تطهير الجنان والأركان',          'aqeedah', r'تطهير\s*الجنان'),
    ('humaydi',     'أصول السنة للحميدي',             'aqeedah', r'[أا]صول\s*السن[ةه]\s*(?:ال|لل)?حميدي'),
    ('asad',        'عقيدة أسد بن موسى',              'aqeedah', r'[أا]سد\s*بن\s*موسى|[أا]سد\s*السنة'),
    ('malik',       'عقيدة الإمام مالك',              'aqeedah', r'عقيدة\s*ال[إا]مام\s*مالك'),
    ('rasail',      'قراءات في رسائل الاعتقاد',       'aqeedah', r'الاقتصاد\s*في\s*الاعتقاد|وصية\s*الذهبي|الإجابة\s*الجلية|منزلة\s*السنة|لزوم\s*السنة|'
                                                                 r'سفيان\s*بن\s*سعيد|سعيد\s*بن\s*جبير|يوسف\s*بن\s*[أا]سباط|زاد\s*الداعية|عقيدة\s*الرائيين'),
    ('sifat',       'الصفات الإلهية',                 'aqeedah', r'الصفات\s*ال\S*لهية|الصفاتةالالهية|[إا]ثبات\s*العينين'),
    ('daa-dawa',    'قراءة الداء والدواء لابن القيم', 'aqeedah', r'الداء\s*والدواء'),
    ('tahawiyya',   'شرح العقيدة الطحاوية',           'aqeedah', r'الطحاوي'),
    ('wasitiyya',   'شرح العقيدة الواسطية',           'aqeedah', r'الواسطي'),
    # مجالس رمضان and the سيرة stay whole and separate
    ('ramadan',     'مجالس شهر رمضان',                'lectures', r'مجالس\s*شهر\s*رمضان|مجلس\s*رمضان|مجا\s*لس\s*شهر|المجلس\s*\S+\s*(?:عشر|والعشرون|والعشرين|وعشرون)|'
                                                                   r'^المجلس\s*(?:الثلاثون|الأخير|الاخير)'),
    ('sira',        'السيرة النبوية',                 'sira', r'السيرة|سيرة|غزوة|غروة|قصة\s*موت\s*رسول|وفود\s*العرب|حجة\s*الوداع|مسير\s*خالد|ردة\s*بني'),
    ('nar',         'أسباب دخول النار',               'aqeedah', r'دخول\s*النار|دخو\s*ل\s*النار'),
    # كتاب التوحيد: the book, its أبواب (the team listed these) and the دروس of the Mecca/Jeddah mosques
    ('tawhid',      'شرح كتاب التوحيد',               'aqeedah', r'كتاب\s*التوحيد|ك\s*التوحيد|التوحيد|'
                                                                 r'باب\s*ما\s*جاء\s*ف?ي?\s*|باب\s*الخوف\s*من\s*الشرك|باب\s*من\s*حقق|باب\s*قول\s*الله|'
                                                                 r'باب\s*ما\s*?جاء|من\s*جحد|الدعاء\s*[إأا]ل[يى]\s*شهادة|بيان\s*شي.?\s*من\s*[أا]نواع\s*السحر|'
                                                                 r'باب\s*لا\s*يذبح|منكري\s*القدر|باب\s*من\s*هزل|باب\s*من\s*[اأ]طاع|باب\s*الشفاعة|باب\s*من\s*الشرك|'
                                                                 r'باب\s*من\s*ال[إا]يمان\s*بالله|باب\s*التبشير|باب\s*ال?دعاء|باب\s*بيان|باب\s*من\s*تبرك|'
                                                                 r'باب\s*لا\s*يقال\s*السلام'),
    ('siyam',       'أحكام الصيام',                   'fiqh',    r'الصيام|الصوم\b'),
    ('khutab',      'خطب الجمعة',                     'khutab',  r'خطبة|خطبتا|خطبتي|خطبه|الخطبة'),
    ('tilawa',      'تلاوات',                         'tilawa',  r'تلاوة|تلاوه|برواية|صلاة\s*القيام|صلأة\s*ألقيام|التراويح'),
    ('ajurrumiyya', 'قراءة الممتع في شرح الآجرومية',  'alah', r'الآجروم|الاجروم|الآجرم'),
    ('tuhfa',       'قراءة تحفة الأطفال',             'alah',   r'تحفة\s*الاطفال|تحفة\s*الأطفال'),
    ('lectures',    'محاضرات وكلمات',                 'lectures', r'محاضرة|محاضره|كلمة|كلمه|نصيحة|نصيحه|تعزية|تعز\s*ية|تعزيه'),
    # a درس named only by its mosque is a كتاب التوحيد lesson (the team, 2026-10-06: «دروس مكة ... أكثرها في كتاب التوحيد»)
    ('tawhid',      'شرح كتاب التوحيد',               'aqeedah', r'درس\s*(?:جامع|ج\b)|دروس\s*مكة|جامع\s*(?:شهيد\s*المحراب|زمزم|الرحمن|الرحمان|الراجحي|البديوي|الشريف)'),
    ('fatawa',      'أسئلة وأجوبة',                   'lectures', r'سؤال|اسئلة|أسئلة|فتوى|فتاوى|جواب'),
]
SERIES_RE = [(sid, t, sec, re.compile(p)) for sid, t, sec, p in SERIES]

AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
MONTHS = {'محرم': 1, 'صفر': 2, 'ربيع الاول': 3, 'ربيع الأول': 3, 'ربيع اول': 3, 'ربيع الآخر': 4, 'ربيع الاخر': 4,
          'ربيع الثاني': 4, 'جمادى الاولى': 5, 'جمادى الأولى': 5, 'جمادى الاخرة': 6, 'جمادى الآخرة': 6,
          'جمادى الثانية': 6, 'رجب': 7, 'شعبان': 8, 'رمضان': 9, 'شوال': 10, 'ذو القعدة': 11, 'ذي القعدة': 11,
          'ذو العقدة': 11, 'ذو الحجة': 12, 'ذي الحجة': 12}
ORDINALS = {'الأول': 1, 'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7,
            'الثامن': 8, 'التاسع': 9, 'العاشر': 10, 'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13,
            'الرابع عشر': 14, 'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
            'التاسع عشر': 19, 'العشرون': 20}
CUT_NAME = re.compile(r'-?AudioConverter')      # these file names were cut to ~15 characters before the suffix
JUNK_NAME = re.compile(r'^(AUD|PTT|audio|VID|WA|Recording|rec|voice|record|\d+$|[\d_\- ]+$)', re.I)
EMOJI = re.compile('[\U0001F000-\U0001FFFF☀-➿⬀-⯿■-◿️‍‏‎⁦-⁩]')


def text_of(x):
    t = x.get('text')
    return t if isinstance(t, str) else ''.join(p if isinstance(p, str) else p.get('text', '') for p in t)


def clean(s):
    s = unicodedata.normalize('NFC', s or '')     # some posts write ئ as ي + a combining hamza, which no pattern would match
    s = EMOJI.sub(' ', s).replace('_', ' ').replace('ـ', '').replace('ﻯ', 'ى').replace('ﻱ', 'ي')
    s = re.sub(r'[ً-ْ]', '', s)               # diacritics
    return re.sub(r'\s+', ' ', s).strip()


def name_title(fn):
    if not fn:
        return ''
    stem = re.sub(r'\.(m4a|mp3|ogg|opus|aac|wav|amr|mp4)$', '', fn, flags=re.I)
    stem = re.sub(r'-?AudioConverter.*$', '', stem)
    if JUNK_NAME.match(stem.strip()) or JUNK_CAPTION.match(clean(stem)):
        return ''
    return clean(stem)


def caption_title(t):
    """First line of a caption that actually names the lesson (channel boilerplate like «جديد الدروس» is skipped)."""
    for line in (t or '').split('\n'):
        c = clean(line).strip(' -:.*#')
        if len(c) >= 6 and not re.match(r'^(فضيلة|لفضيلة|مع فضيلة|الشيخ|جامع|مسجد|http|يحي|قناة|رابط|اشترك|انشر|حفظه الله|وفقه الله)', c) and not JUNK_CAPTION.match(c):
            return c[:160]
    return ''


def hijri(s):
    s = s.translate(AR_DIGITS).replace('ا', 'ا')
    m = re.search(r'(\d{1,2})\s*[/\-.ا،؛]\s*(\d{1,2})\s*[/\-.ا،؛]\s*(14\d\d)', s)
    if m:
        return f'{m.group(3)}-{int(m.group(2))}-{int(m.group(1))}'
    m = re.search(r'(14\d\d)\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})', s)
    if m:
        return f'{m.group(1)}-{int(m.group(2))}-{int(m.group(3))}'
    for name, num in sorted(MONTHS.items(), key=lambda kv: -len(kv[0])):
        m = re.search(r'(\d{1,2})\s*' + name + r'\s*(14\d\d)', s)
        if m:
            return f'{m.group(2)}-{num}-{int(m.group(1))}'
    return ''


def lesson_no(s):
    s2 = s.translate(AR_DIGITS)
    m = re.search(r'(?:الدرس|درس|المجلس|الحلقة|الشريط)\s*(?:رقم)?\s*\(?(\d{1,3})\)?', s2)
    if m:
        return int(m.group(1))
    for w, n in sorted(ORDINALS.items(), key=lambda kv: -len(kv[0])):
        if re.search(r'(?:الدرس|المجلس|الحلقة)\s+' + w + r'(?!\s*عشر)', s2):
            return n
    return None


JUNK_CAPTION = re.compile(r'^(مقطع صوتي|صوت|تسجيل صوتي|جديد|الجديد|تسجيل جديد|مجموعة\s*\d+|للإستماع|للاستماع)\b')
VOICE_BPS = 18300 / 8          # bytes/s of the channels' voice notes (5.66 MB voice = 41:20 m4a, posts 5968/5969)
WINDOW = 1800                  # an announcement must precede its audio by at most 30 min
QA_WINDOW = 86400              # ... but a question is answered by the next audio, sometimes hours later
AUDIO_LINK = re.compile(r'https?://\S*(?:top4top\.net|archive\.org)/\S+\.(?:mp3|m4a|amr|ogg|aac)', re.I)


def is_audio(x):
    return x.get('media_type') in ('audio_file', 'voice_message') or (x.get('mime_type') or '').startswith('audio/')


def links_of(x):
    t = x.get('text')
    return [] if isinstance(t, str) else [p.get('href') or p.get('text', '') for p in t
                                          if isinstance(p, dict) and p.get('type') in ('link', 'text_link')]


QA_NOISE = re.compile(r'^(?:[\W_]+|و?[أاإ]حسن (?:الله )?[إا]لي(?:كم|ك|كن)|السل\S* عليكم\S*(?: \S*رحم\S*)?(?: \S*ل[لہه]\S*)?(?: \S*برك\S*)?|'
                      r'حياكم الله|بارك الله فيكم|جزاكم الله خيرا|شيخنا(?: الفاضل)?|يا شيخ(?:نا)?|فضيلة الشيخ|سؤالي|'
                      r'سائل(?:ة)? (?:يقول|تقول)|يقول|تقول|سـ?/|س/)\s*')


def announcement(t):
    """Book, Hijri date and stated length from a 'تم التسجيل' style post."""
    c = clean(t)
    book = ''
    m = re.search(r'(?:شرح|كتاب)\s*(?:كتاب)?\s*[:\-]?\s*[\(\[]\s*([^\)\]]{3,80})[\)\]]', c)
    if m:
        book = re.sub(r'\s*-\s*', ' ', m.group(1)).strip(' -')
    elif re.search(r'خطب', c):
        m = re.search(r'خطبة الجمعة\s*([^\n]{0,60})', clean(t.split('\n\n')[0] + ' ' + ' '.join(t.split('\n')[:4])))
        book = 'خطبة الجمعة'
    d = re.search(r'\(?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\)?\s*دقيق', c.translate(AR_DIGITS))
    secs = None
    if d:
        a, b, e = int(d.group(1)), int(d.group(2)), d.group(3)
        secs = a * 3600 + b * 60 + int(e) if e else a * 60 + b
    return book, hijri(c), secs, ('تم التسجيل' in c or bool(book))


BOILER = re.compile(r'العلم اشرف|العلم أشرف|اكرم من يمشي|أكرم من يمشي|تم التسجيل|دعوتكم|فضيلة|لفضيلة|الشيخ الوالد|'
                    r'جامع|مسجد|http|موقع|لشهر|اليوم|بعد صلاة|حفظه الله|القنوات|قناة|الدال على الخير|جديد|السلام عليكم|'
                    r'سائل يقول|احسن الله|أحسن الله|^\W*$')


def question(t):
    """The question asked in a Q&A post, without greetings, shortened."""
    t = re.split(r'═', t.replace('ﻯ', 'ى').replace('ﻱ', 'ي'))[0]          # the question comes before the separator
    t = re.sub(r'https?://\S+', ' ', t)
    lines = [clean(x).strip(' 【】[]-:.*') for x in t.split('\n')]
    lines = [l for l in lines if l and not re.search(r'^\W*الس\W*\d*\W*ؤال|مجموعة أسئلة|^جواب|رابط|للإستماع|للاستماع|للمشاهدة|'
                                                      r'للتحميل|للإشتراك|للاشتراك|يحيى بن أحمد|حفظه الله', l)]
    body = re.sub(r'\.{2,}', ' ', ' '.join(lines))
    body = re.sub(r'^\d+\s*[_\-.)]?\s+', '', body.strip(' *【】'))
    for _ in range(8):
        body = QA_NOISE.sub('', body).strip()
    body = body.replace('【', '').replace('】', '').strip()
    end = re.search(r'[?؟]', body)
    body = body[:end.start() + 1] if end and end.start() > 10 else body
    return (body[:110].rsplit(' ', 1)[0] + '…') if len(body) > 120 else body


def desc_title(t):
    """A short title from a describing post: Q&A number + question, the book, or its first real line."""
    c = clean(t).translate(AR_DIGITS)
    q = re.search(r'الس\W*\(?\s*(\d{1,3})\s*\)?\W*ؤال', c)
    if q:
        body = question(t)
        return f"السؤال {int(q.group(1))}" + (': ' + body if body else '')
    g = re.search(r'مجموعة أسئلة\W*(\d{1,3})', c)
    if g:
        body = question(re.sub(r'^.*?مجموعة أسئلة\W*\d+\W*', '', t.translate(AR_DIGITS), flags=re.S))
        return f"مجموعة أسئلة {int(g.group(1))}" + (': ' + body if body else '')
    if re.match(r'\W*(?:سـ?/|س/|أحسن الله إليكم|احسن الله اليكم)', c):
        body = question(t)
        if body:
            return body
    sura = re.search(r'سورة\s+[^\s()،,]+(?:\s+(?:من|الآيات|آية)\s+[^()]{0,30}?\d+\s*(?:إلى|الى|-)\s*\d+)?', c.replace('ﻯ', 'ى').replace('إلى', ' إلى '))
    if re.search(r'تلاوة|تلاوه', c) and sura:
        return 'تلاوة ' + re.sub(r'\s+', ' ', sura.group(0)).strip()
    if 'لقاء مع' in c:
        return 'لقاء مع الشيخ' + (' والإجابة على بعض الأسئلة' if re.search(r'الإجابة|الاجابة', c) else '')
    book = announcement(t)[0]
    lines = [clean(x).strip(' -:.*#©⇦[](){}【】') for x in (t or '').split('\n')]
    for i, l in enumerate(lines):                       # "عنوان المحاضرة 🔽" then the title on the next line
        if re.search(r'عنوان|بعنوان', l):
            rest = re.sub(r'.*(?:عنوان المحاضرة|عنوان الخطبة|بعنوان)\s*:?', '', l).strip()
            nxt = rest or next((n for n in lines[i + 1:] if len(n) >= 4), '')
            if nxt:
                return (book + ': ' + nxt if book and book not in nxt else nxt)[:160]
    if book:                                            # a lesson in a book: the book name (+ date added later)
        return book
    for l in lines:
        if len(l) >= 6 and not BOILER.search(l):
            return l[:160]
    return ''


def length(x):
    if x.get('duration_seconds'):
        return x['duration_seconds'], True
    if x.get('media_type') == 'voice_message' and x.get('file_size'):
        return x['file_size'] / VOICE_BPS, False
    return None, False


def fits(stated, x):
    got, exact = length(x)
    if stated is None or got is None:
        return True
    tol = max(120, stated * (0.05 if exact else 0.3))
    return abs(stated - got) <= tol


SPEAKER = re.compile(r'(فضيلة|الشيخ|الوالد|يحيى|يحي|بن|أحمد|احمد|الجابري|حفظه الله)\s*')


def merge_same_title(lessons):
    key = lambda l: re.sub(r'[^\u0621-\u064A0-9٠-٩]', '', SPEAKER.sub('', l['title']))
    out, seen = [], {}
    for l in sorted(lessons, key=lambda l: l['date']):
        k = key(l)
        o = seen.get(k)
        if len(k) >= 12 and o and abs((datetime.fromisoformat(l['date']) - datetime.fromisoformat(o['date'])).days) <= 2 \
                and o['duration_min'] and l['duration_min'] \
                and abs(o['duration_min'] - l['duration_min']) <= max(2, 0.3 * max(o['duration_min'], l['duration_min'])):
            a, b = (o, l) if (o['kind'] == 'audio_file', o['duration_exact']) >= (l['kind'] == 'audio_file', l['duration_exact']) else (l, o)
            a['posts'] = a['posts'] + b['posts']
            a['alt_copy'] = b['id']
            if a is l:
                out[out.index(o)] = l; seen[k] = l
            continue
        seen[k] = l; out.append(l)
    return out


def link_post(x, ch):
    """A text post whose answer/recording is a link to an audio file elsewhere: a lesson whose own post is the description."""
    t = text_of(x)
    y = {k: x[k] for k in ('id', 'date', 'date_unixtime')}
    y.update(_ch=ch, _t='', _link=next(u for u in links_of(x) if AUDIO_LINK.match(u)),
             _ann=(f"{ch}/{x['id']}", t, announcement(t), True) if desc_title(t) else None)
    return y


def main():
    posts = []
    channels = [ch for ch in CHANNELS if os.path.exists(f'{ROOT}/{ch}/result.json')]
    for ch in channels:
        msgs = json.load(open(f'{ROOT}/{ch}/result.json'))['messages']
        prev_text = None
        for x in msgs:
            if x.get('type') != 'message':
                continue
            if not is_audio(x):
                if text_of(x).strip() and not x.get('file'):
                    prev_text = x
                    if ch == QA_CHANNEL and any(AUDIO_LINK.match(u) for u in links_of(x)):
                        posts.append(link_post(x, ch))      # the answer is a link in the post itself
                continue
            x['_ch'], x['_t'] = ch, text_of(x)
            # the post just before an audio often describes it ("تم التسجيل ..."); keep it if the
            # stated length in it matches the clip
            x['_ann'] = None
            window = QA_WINDOW if ch == QA_CHANNEL and re.search(r'ؤال|ؤَالُ|مجموعة أسئلة', text_of(prev_text or {'text': ''})) else WINDOW
            if prev_text and int(x['date_unixtime']) - int(prev_text['date_unixtime']) <= window \
                    and desc_title(text_of(prev_text)):
                info = announcement(text_of(prev_text))
                x['_ann'] = (f"{ch}/{prev_text['id']}", text_of(prev_text), info, fits(info[2], x))
            posts.append(x)
            if ch == QA_CHANNEL:
                prev_text = None                              # one question per answer
        # an audio with no description before it may be described by the post right after it
    by_id = {(p['_ch'], p['id']): p for p in posts}
    for ch in channels:
        msgs = json.load(open(f'{ROOT}/{ch}/result.json'))['messages']
        last_audio = None
        for x in msgs:
            if x.get('type') != 'message':
                continue
            if is_audio(x):
                last_audio = by_id[(ch, x['id'])]
                continue
            t = text_of(x)
            if last_audio and not last_audio['_ann'] and t.strip() and not x.get('file') \
                    and int(x['date_unixtime']) - int(last_audio['date_unixtime']) <= 600 and desc_title(t):
                info = announcement(t)
                last_audio['_ann'] = (f"{ch}/{x['id']}", t, info, fits(info[2], last_audio))
            last_audio = None

    # 1) same file (size + duration) posted more than once
    groups = collections.OrderedDict()
    for x in posts:
        groups.setdefault(x.get('_link') or (x.get('file_size'), x.get('duration_seconds')), []).append(x)
    groups = list(groups.values())
    # 2) different files described by the same announcement (voice note + m4a of one lesson)
    parent = list(range(len(groups)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    by_ann = {}
    for i, g in enumerate(groups):
        for x in g:
            if x['_ann'] and x['_ann'][3] and x['_ann'][2][3] and len(clean(x['_ann'][1])) > 60:
                key = clean(x['_ann'][1])
                if key in by_ann:
                    parent[find(i)] = find(by_ann[key])
                else:
                    by_ann[key] = i
    merged = collections.OrderedDict()
    for i, g in enumerate(groups):
        merged.setdefault(find(i), []).extend(g)

    lessons = []
    for g in merged.values():
        # primary copy: a real audio file with a known length beats a voice note; then the official channel
        g.sort(key=lambda x: (x.get('media_type') != 'audio_file', not x.get('duration_seconds'), bool(x.get('_link')),
                              CHANNELS.index(x['_ch']), int(x['date_unixtime'])))
        main_post = g[0]
        dur, exact = length(main_post)
        size = main_post.get('file_size')
        caps = [x['_t'] for x in g if x['_t'].strip()]     # caption_title() skips the channel's boilerplate lines
        names = [x.get('file_name') for x in g if x.get('file_name')]
        anns = [x['_ann'] for x in g if x['_ann']]
        good_ann = next((a for a in anns if a[3]), None)
        title, source, cut = '', '', False      # cut: the title is a file name the uploader shortened, so trust the post
        for c in caps:
            title = desc_title(c) if re.search(r'الس\W*\(?\s*\d{1,3}\s*\)?\W*ؤال|مجموعة أسئلة', clean(c)) else caption_title(c)
            if title:
                source = 'caption'; break
        if not title:
            for n in names:
                t2 = name_title(n)
                if t2 and CUT_NAME.search(n) and len(t2) <= 18 and good_ann:
                    continue          # «التعليق على الف-AudioConverter.amr»: the uploader cut the name, the post says more
                if t2:
                    title, source, cut = t2, 'file name', bool(CUT_NAME.search(n)); break
        if not title and good_ann:
            title = desc_title(good_ann[1])
            hd0 = good_ann[2][1]
            if title and hd0 and hd0.split('-')[0] not in title.translate(AR_DIGITS):
                title += ' ' + hd0.replace('-', '/')
            source = 'description post' if title else ''
        blob = clean(' '.join(caps + [n or '' for n in names] + ([good_ann[1]] if good_ann else [])))
        tb = clean(title)
        series = ('', '', '') if cut else next(((sid, t, sec) for sid, t, sec, rx in SERIES_RE   # the title names the book
                       if rx.search(tb) or rx.search(tb.replace(' ', ''))), ('', '', ''))
        if not series[0]:                                                                   # ... else the post around it
            series = next(((sid, t, sec) for sid, t, sec, rx in SERIES_RE
                           if rx.search(blob) or rx.search(blob.replace(' ', ''))), ('', '', ''))
        if not series[0] and title:
            series = ('misc', 'دروس ومحاضرات متفرقة', 'lectures')     # titled one-offs: publish, no review
        qa = bool(re.search(r'الس\W*\(?\s*\d{1,3}\s*\)?\W*ؤال|مجموعة أسئلة', clean(' '.join(caps))))
        if re.match(r'السؤال |مجموعة أسئلة ', title) or (main_post['_ch'] == QA_CHANNEL and title and (qa or series[0] in ('misc', ''))):
            series = next((sid, t, sec) for sid, t, sec, rx in SERIES_RE if sid == 'fatawa')
        fwd = sorted({x.get('forwarded_from') for x in g if x.get('forwarded_from')} - SHEIKH_CHANNELS)
        sheikh = bool(re.search(r'يحيى|يحي|الجابري', blob))
        weak = series[0] in ('misc', 'lectures', 'fatawa', '')
        others = [s for s in OTHER_SCHOLARS if s in blob] if (weak and not sheikh) else []
        if sheikh: fwd = []
        flags = []
        if not title: flags.append('no title')
        if fwd: flags.append('forwarded from ' + ' / '.join(fwd))
        if others: flags.append('mentions ' + ' / '.join(others))
        if not series[0]: flags.append('no series')
        if anns and not good_ann and not title: flags.append('description length mismatch')
        if title and series[1] and len(re.findall(r'[\u0621-\u064A]{3,}', title)) <= 1:
            title = series[1] + ' ' + title            # a bare date as title: prefix the series name
        hd = hijri(blob) or (good_ann[2][1] if good_ann else '')
        lessons.append({
            'id': f"{main_post['_ch']}-{main_post['id']}",
            'title': title, 'title_source': source,
            'series': series[0], 'series_title': series[1], 'section': series[2],
            'lesson_number': lesson_no(blob), 'hijri': hd,
            'date': main_post['date'][:10],
            'duration_min': round(dur / 60, 1) if dur else None,
            'duration_exact': exact,
            'stated_min': round(good_ann[2][2] / 60, 1) if good_ann and good_ann[2][2] else None,
            'size_mb': round(size / 1e6, 1) if size else None,
            'kind': main_post.get('media_type') or ('link' if main_post.get('_link') else 'audio_file'),
            'file_name': main_post.get('file_name') or '',
            'posts': [f"https://t.me/{x['_ch']}/{x['id']}" for x in g],
            'description_post': f"https://t.me/{good_ann[0]}" if good_ann else '',
            'have_file': not str(main_post.get('file', '')).startswith('('),
            'flags': flags,
            'caption': caps[0][:300] if caps else (good_ann[1][:300] if good_ann else ''),
        })
    lessons = merge_same_title(lessons)
    lessons.sort(key=lambda l: l['date'])
    json.dump(lessons, open(f'{ROOT}/lessons.json', 'w'), ensure_ascii=False, indent=1)
    return posts, lessons


if __name__ == '__main__':
    posts, lessons = main()
    c = collections.Counter(l['series'] or '(none)' for l in lessons)
    print('posts', len(posts), 'unique lessons', len(lessons))
    print('hours', round(sum(l['duration_min'] or 0 for l in lessons) / 60), 'GB', round(sum(l['size_mb'] or 0 for l in lessons) / 1e3, 1))
    print(c.most_common())
    print('title sources', collections.Counter(l['title_source'] or '(none)' for l in lessons))
    print('flags', collections.Counter(f.split(' ')[0] + ' ' + f.split(' ')[1] if ' ' in f else f for l in lessons for f in l['flags']))
    print('with hijri', sum(1 for l in lessons if l['hijri']), 'with number', sum(1 for l in lessons if l['lesson_number']))
