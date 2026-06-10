"""
RabbiRabbit Data Builder
Downloads KJV, ASV, WEB Bible texts and cross-reference data.
All sources are public domain. Outputs clean unified JSON.
"""

import json
import urllib.request
import os
import time
import zipfile
import io

OUTPUT_DIR = "/home/claude/RabbiRabbit/data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

BOOKS = [
    ("Genesis","GEN",50),("Exodus","EXO",40),("Leviticus","LEV",27),
    ("Numbers","NUM",36),("Deuteronomy","DEU",34),("Joshua","JOS",24),
    ("Judges","JDG",21),("Ruth","RUT",4),("1 Samuel","1SA",31),
    ("2 Samuel","2SA",24),("1 Kings","1KI",22),("2 Kings","2KI",25),
    ("1 Chronicles","1CH",29),("2 Chronicles","2CH",36),("Ezra","EZR",10),
    ("Nehemiah","NEH",13),("Esther","EST",10),("Job","JOB",42),
    ("Psalms","PSA",150),("Proverbs","PRO",31),("Ecclesiastes","ECC",12),
    ("Song of Solomon","SNG",8),("Isaiah","ISA",66),("Jeremiah","JER",52),
    ("Lamentations","LAM",5),("Ezekiel","EZK",48),("Daniel","DAN",12),
    ("Hosea","HOS",14),("Joel","JOL",3),("Amos","AMO",9),
    ("Obadiah","OBA",1),("Jonah","JON",4),("Micah","MIC",7),
    ("Nahum","NAH",3),("Habakkuk","HAB",3),("Zephaniah","ZEP",3),
    ("Haggai","HAG",2),("Zechariah","ZEC",14),("Malachi","MAL",4),
    ("Matthew","MAT",28),("Mark","MRK",16),("Luke","LUK",24),
    ("John","JHN",21),("Acts","ACT",28),("Romans","ROM",16),
    ("1 Corinthians","1CO",16),("2 Corinthians","2CO",13),("Galatians","GAL",6),
    ("Ephesians","EPH",6),("Philippians","PHP",4),("Colossians","COL",4),
    ("1 Thessalonians","1TH",5),("2 Thessalonians","2TH",3),("1 Timothy","1TI",6),
    ("2 Timothy","2TI",4),("Titus","TIT",3),("Philemon","PHM",1),
    ("Hebrews","HEB",13),("James","JAS",5),("1 Peter","1PE",5),
    ("2 Peter","2PE",3),("1 John","1JN",5),("2 John","2JN",1),
    ("3 John","3JN",1),("Jude","JUD",1),("Revelation","REV",22),
]

def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'RabbiRabbit/1.0'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode('utf-8')
        except Exception as e:
            if i < retries - 1:
                time.sleep(2)
            else:
                raise

def build_kjv():
    print("\n📖 Building KJV...")
    bible = {
        "translation": "KJV",
        "name": "King James Version",
        "year": 1769,
        "license": "Public Domain",
        "books": []
    }
    name_map = {
        "Song of Solomon": "SongofSolomon",
        "1 Samuel": "1Samuel", "2 Samuel": "2Samuel",
        "1 Kings": "1Kings", "2 Kings": "2Kings",
        "1 Chronicles": "1Chronicles", "2 Chronicles": "2Chronicles",
        "1 Corinthians": "1Corinthians", "2 Corinthians": "2Corinthians",
        "1 Thessalonians": "1Thessalonians", "2 Thessalonians": "2Thessalonians",
        "1 Timothy": "1Timothy", "2 Timothy": "2Timothy",
        "1 Peter": "1Peter", "2 Peter": "2Peter",
        "1 John": "1John", "2 John": "2John", "3 John": "3John",
    }
    base = "https://raw.githubusercontent.com/aruljohn/Bible-kjv/master"
    success = 0
    for name, code, _ in BOOKS:
        filename = name_map.get(name, name.replace(" ", ""))
        url = f"{base}/{filename}.json"
        try:
            raw = fetch(url)
            data = json.loads(raw)
            book_data = {"name": name, "code": code, "chapters": []}
            for ch in data["chapters"]:
                verses = [{"verse": int(v["verse"]), "text": v["text"].strip()}
                          for v in ch["verses"]]
                book_data["chapters"].append({
                    "chapter": int(ch["chapter"]),
                    "verses": verses
                })
            bible["books"].append(book_data)
            success += 1
            print(f"  ✓ {name}")
        except Exception as e:
            print(f"  ✗ {name}: {e}")
        time.sleep(0.1)
    out = f"{OUTPUT_DIR}/kjv.json"
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(bible, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(out) / 1024 / 1024
    print(f"\n✅ KJV: {success}/66 books | {size:.2f} MB")
    return success

def build_getbible(translation, name, year, license_text):
    print(f"\n📖 Building {translation.upper()}...")
    bible = {
        "translation": translation.upper(),
        "name": name,
        "year": year,
        "license": license_text,
        "books": []
    }
    success = 0
    for book_name, code, _ in BOOKS:
        url = f"https://getbible.net/v2/{translation}/{code.lower()}.json"
        try:
            raw = fetch(url)
            data = json.loads(raw)
            book_data = {"name": book_name, "code": code, "chapters": []}
            for ch_str, ch_data in sorted(data["chapters"].items(), key=lambda x: int(x[0])):
                verses = sorted([
                    {"verse": int(v_str), "text": v_data["verse"].strip()}
                    for v_str, v_data in ch_data["verses"].items()
                ], key=lambda x: x["verse"])
                book_data["chapters"].append({
                    "chapter": int(ch_str),
                    "verses": verses
                })
            bible["books"].append(book_data)
            success += 1
            print(f"  ✓ {book_name}")
        except Exception as e:
            print(f"  ✗ {book_name}: {e}")
        time.sleep(0.15)
    out = f"{OUTPUT_DIR}/{translation.lower()}.json"
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(bible, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(out) / 1024 / 1024
    print(f"\n✅ {translation.upper()}: {success}/66 books | {size:.2f} MB")
    return success

def build_cross_refs():
    print("\n🔗 Building cross-reference data...")
    # Primary: OpenBible.info zip
    try:
        url = "https://a.openbible.info/data/cross-references.zip"
        req = urllib.request.Request(url, headers={'User-Agent': 'RabbiRabbit/1.0'})
        raw = urllib.request.urlopen(req, timeout=30).read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            csv_name = [n for n in z.namelist() if n.endswith('.txt') or n.endswith('.csv')][0]
            content = z.read(csv_name).decode('utf-8')
        out = f"{OUTPUT_DIR}/cross-refs.csv"
        with open(out, 'w', encoding='utf-8') as f:
            f.write(content)
        lines = content.count('\n')
        size = os.path.getsize(out) / 1024 / 1024
        print(f"✅ Cross-refs: {lines:,} entries | {size:.2f} MB")
        return True
    except Exception as e:
        print(f"  Primary source failed: {e}")

    # Fallback: shandran GitHub mirror
    try:
        url2 = "https://raw.githubusercontent.com/shandran/openbible/main/cross_references.csv"
        content = fetch(url2)
        out = f"{OUTPUT_DIR}/cross-refs.csv"
        with open(out, 'w', encoding='utf-8') as f:
            f.write(content)
        lines = content.count('\n')
        size = os.path.getsize(out) / 1024 / 1024
        print(f"✅ Cross-refs (mirror): {lines:,} entries | {size:.2f} MB")
        return True
    except Exception as e2:
        print(f"  Mirror also failed: {e2}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("RabbiRabbit Data Builder")
    print("=" * 50)

    # Test getbible.net
    print("\nTesting getbible.net...")
    try:
        test = fetch("https://getbible.net/v2/web/jhn.json")
        data = json.loads(test)
        print(f"✓ getbible.net OK — John has {len(data['chapters'])} chapters")
        gb_ok = True
    except Exception as e:
        print(f"✗ getbible.net failed: {e}")
        gb_ok = False

    results = {}
    results['kjv'] = build_kjv()

    if gb_ok:
        results['web'] = build_getbible(
            "web", "World English Bible", 2020, "Public Domain")
        results['asv'] = build_getbible(
            "asv", "American Standard Version", 1901, "Public Domain")
    else:
        print("\n⚠️  getbible.net unavailable — skipping WEB and ASV")

    results['xref'] = build_cross_refs()

    print("\n" + "=" * 50)
    print("RESULTS")
    print("=" * 50)
    for k, v in results.items():
        ok = v == 66 if isinstance(v, int) else v
        print(f"{'✅' if ok else '❌'} {k.upper()}: {v}")

    print("\nFile sizes:")
    for fname in sorted(os.listdir(OUTPUT_DIR)):
        path = f"{OUTPUT_DIR}/{fname}"
        size = os.path.getsize(path) / 1024 / 1024
        print(f"  {fname}: {size:.2f} MB")
