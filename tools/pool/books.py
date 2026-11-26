#!/usr/bin/env python3
"""The 66 books, once. Code (library standard), the English name the Historical Christian Faith database uses in its file names, the abbreviation
Matthew Henry prints before chapter:verse (counted from the library MHC text), and the other forms of the name a citation may use.
HCF names were read from the pinned database's file list (84,751 files, commit a88dc031b9a1), e.g. 'Psalms', 'Song of Solomon', '1 Corinthians'."""

# code: (HCF English name, Henry abbreviation, [other citation forms])
_T = {
 'GEN': ('Genesis', 'Ge', ['Gen', 'Genesis']),                 'EXO': ('Exodus', 'Ex', ['Exo', 'Exod', 'Exodus']),
 'LEV': ('Leviticus', 'Le', ['Lev', 'Leviticus']),             'NUM': ('Numbers', 'Nu', ['Num', 'Numbers']),
 'DEU': ('Deuteronomy', 'De', ['Deut', 'Deu', 'Deuteronomy']), 'JOS': ('Joshua', 'Jos', ['Josh', 'Joshua']),
 'JDG': ('Judges', 'Jdg', ['Judg', 'Jud', 'Judges']),          'RUT': ('Ruth', 'Ru', ['Ruth']),
 '1SA': ('1 Samuel', '1Sa', ['1Sam', '1 Sam', '1 Samuel']),    '2SA': ('2 Samuel', '2Sa', ['2Sam', '2 Sam', '2 Samuel']),
 '1KI': ('1 Kings', '1Ki', ['1Kgs', '1 Kings']),               '2KI': ('2 Kings', '2Ki', ['2Kgs', '2 Kings']),
 '1CH': ('1 Chronicles', '1Ch', ['1Chr', '1 Chron', '1 Chronicles']), '2CH': ('2 Chronicles', '2Ch', ['2Chr', '2 Chron', '2 Chronicles']),
 'EZR': ('Ezra', 'Ezr', ['Ezra']),                             'NEH': ('Nehemiah', 'Ne', ['Neh', 'Nehemiah']),
 'EST': ('Esther', 'Es', ['Est', 'Esth', 'Esther']),           'JOB': ('Job', 'Job', ['Job']),
 'PSA': ('Psalms', 'Ps', ['Psa', 'Psalm', 'Psalms']),          'PRO': ('Proverbs', 'Pr', ['Prov', 'Pro', 'Proverbs']),
 'ECC': ('Ecclesiastes', 'Ec', ['Eccl', 'Ecc', 'Ecclesiastes']), 'SNG': ('Song of Solomon', 'So', ['Song', 'Cant', 'Song of Solomon', 'Song of Songs']),
 'ISA': ('Isaiah', 'Isa', ['Is', 'Isaiah']),                   'JER': ('Jeremiah', 'Jer', ['Jeremiah']),
 'LAM': ('Lamentations', 'La', ['Lam', 'Lamentations']),       'EZK': ('Ezekiel', 'Eze', ['Ezek', 'Ezekiel']),
 'DAN': ('Daniel', 'Da', ['Dan', 'Daniel']),                   'HOS': ('Hosea', 'Ho', ['Hos', 'Hosea']),
 'JOL': ('Joel', 'Joe', ['Joel']),                             'AMO': ('Amos', 'Am', ['Amos']),
 'OBA': ('Obadiah', 'Ob', ['Obad', 'Obadiah']),                'JON': ('Jonah', 'Jon', ['Jonah']),
 'MIC': ('Micah', 'Mic', ['Micah']),                           'NAH': ('Nahum', 'Na', ['Nah', 'Nahum']),
 'HAB': ('Habakkuk', 'Hab', ['Habakkuk']),                     'ZEP': ('Zephaniah', 'Zep', ['Zeph', 'Zephaniah']),
 'HAG': ('Haggai', 'Hag', ['Haggai']),                         'ZEC': ('Zechariah', 'Zec', ['Zech', 'Zechariah']),
 'MAL': ('Malachi', 'Mal', ['Malachi']),
 'MAT': ('Matthew', 'Mt', ['Mt', 'Mat', 'Matt', 'Matthew']),   'MRK': ('Mark', 'Mr', ['Mr', 'Mk', 'Mark']),
 'LUK': ('Luke', 'Lu', ['Lk', 'Luke']),                        'JHN': ('John', 'Joh', ['Joh', 'John']),
 'ACT': ('Acts', 'Ac', ['Act', 'Acts']),                       'ROM': ('Romans', 'Ro', ['Ro', 'Rom', 'Romans']),
 '1CO': ('1 Corinthians', '1Co', ['1Cor', '1 Cor', '1 Corinthians']), '2CO': ('2 Corinthians', '2Co', ['2Cor', '2 Cor', '2 Corinthians']),
 'GAL': ('Galatians', 'Ga', ['Gal', 'Galatians']),             'EPH': ('Ephesians', 'Eph', ['Eph', 'Ephesians']),
 'PHP': ('Philippians', 'Php', ['Phil', 'Philippians']),       'COL': ('Colossians', 'Col', ['Colossians']),
 '1TH': ('1 Thessalonians', '1Th', ['1Thess', '1 Thess', '1 Thessalonians']), '2TH': ('2 Thessalonians', '2Th', ['2Thess', '2 Thess', '2 Thessalonians']),
 '1TI': ('1 Timothy', '1Ti', ['1Tim', '1 Tim', '1 Timothy']), '2TI': ('2 Timothy', '2Ti', ['2Tim', '2 Tim', '2 Timothy']),
 'TIT': ('Titus', 'Tit', ['Titus']),                           'PHM': ('Philemon', 'Phm', ['Philem', 'Phile', 'Philemon']),
 'HEB': ('Hebrews', 'Heb', ['Hebrews']),                       'JAS': ('James', 'Jam', ['Jas', 'James']),
 '1PE': ('1 Peter', '1Pe', ['1Pet', '1 Pet', '1 Peter']),      '2PE': ('2 Peter', '2Pe', ['2Pet', '2 Pet', '2 Peter']),
 '1JN': ('1 John', '1Jo', ['1 John', '1John', '1 Joh']),       '2JN': ('2 John', '2Jo', ['2 John', '2John']),
 '3JN': ('3 John', '3Jo', ['3 John', '3John']),                'JUD': ('Jude', 'Jude', ['Jude']),
 'REV': ('Revelation', 'Re', ['Rev', 'Revelation']),
}
ORDER = list(_T)
assert len(ORDER) == 66
HCF_BOOK = {c: v[0] for c, v in _T.items()}
HENRY_ABBR = {c: v[1] for c, v in _T.items()}
def variants(c): return list(dict.fromkeys([_T[c][1]] + _T[c][2]))
# The six books the pool builder first shipped with keep their exact earlier entries, so nothing built for them changes.
_FIRST = {'1JN': ('1Jo', ['1Jo', '1 John', '1John', 'John']), 'ROM': ('Ro', ['Ro', 'Rom', 'Romans']), 'MRK': ('Mr', ['Mr', 'Mk', 'Mark']),
          'EPH': ('Eph', ['Eph', 'Ephesians']), 'MAT': ('Mt', ['Mt', 'Mat', 'Matt', 'Matthew']), 'JHN': ('Joh', ['Joh', 'John'])}
BOOKNAMES = {c: _FIRST.get(c) or (_T[c][1], variants(c)) for c in ORDER}
