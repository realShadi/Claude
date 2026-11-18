#!/usr/bin/env python3
"""Build database/employees-template.xlsx, the Excel layout for the employee list.

    python3 tools/make-template.py        (needs: pip install openpyxl)

The rules written into the sheet (4 to 12 digits, people matched by name) are the ones the app
and database/schema.sql enforce. Change them here when they change there.
"""
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / 'database' / 'employees-template.xlsx'
LAST = 500
wb = Workbook()
ws = wb.active
ws.title = 'עובדים'
ws.sheet_view.rightToLeft = True

base = Font(name='Arial', size=11)
bold = Font(name='Arial', size=11, bold=True)
example = Font(name='Arial', size=11, italic=True, color='5F6B7A')
head_fill = PatternFill('solid', start_color='FFE55C')
thin = Side(style='thin', color='838E9D')

headers = ['שם', 'מספר אישי', 'תפקידים', 'מקסימום משמרות בשבוע']
for col, text in enumerate(headers, start=1):
    c = ws.cell(row=1, column=col, value=text)
    c.font = bold
    c.fill = head_fill
    c.alignment = Alignment(horizontal='right', vertical='center')
    c.border = Border(bottom=thin)
ws.row_dimensions[1].height = 22

# One example row showing the expected format (the importer skips any name containing "דוגמה").
for col, value in enumerate(['נועה (דוגמה)', '482913', 'אחראי/ת משמרת, קופאי/ת', 5], start=1):
    ws.cell(row=2, column=col, value=value).font = example

for row in range(2, LAST + 1):
    for col in range(1, 5):
        c = ws.cell(row=row, column=col)
        if row > 2:
            c.font = base
        c.alignment = Alignment(horizontal='right')
    ws.cell(row=row, column=2).number_format = '@'      # text: a leading zero is kept
    ws.cell(row=row, column=4).number_format = '0'

num = DataValidation(type='textLength', operator='between', formula1='4', formula2='12', allow_blank=True,
                     showErrorMessage=True, errorTitle='מספר אישי', error='המספר האישי צריך להיות 4 עד 12 ספרות.')
mx = DataValidation(type='whole', operator='between', formula1='1', formula2='7', allow_blank=True,
                    showErrorMessage=True, errorTitle='מקסימום משמרות', error='מספר שלם בין 1 ל-7.')
ws.add_data_validation(num)
ws.add_data_validation(mx)
num.add(f'B2:B{LAST}')
mx.add(f'D2:D{LAST}')

legend = [
    'איך ממלאים',
    'ממלאים בעמודות A עד D, שורה אחת לכל עובד/ת, החל משורה 3.',
    'שורה 2 היא דוגמה לפורמט. אפשר למחוק אותה; שורה ששמה כולל "דוגמה" לא מיובאת.',
    'שם: כפי שהעובד/ת מקליד/ה בכניסה למערכת. שם שונה לכל עובד/ת.',
    'מספר אישי: 4 עד 12 ספרות, עדיף מספר אקראי ולא טלפון או תעודת זהות. נשמר כטקסט, כך שאפס בהתחלה לא נמחק.',
    'לעובד/ת חדש/ה חובה למלא מספר אישי. לעובד/ת שכבר במערכת אפשר להשאיר ריק, והמספר לא ישתנה.',
    'תפקידים (לא חובה): כפי שהם רשומים בהגדרות המערכת, מופרדים בפסיק.',
    'מקסימום משמרות בשבוע (לא חובה): מספר שלם בין 1 ל-7. אם התא ריק, נקבע 5.',
    'ייבוא: כניסת מנהל/ת, לשונית "צוות", "ייבוא מאקסל". עובד/ת מזוהה לפי השם: שם קיים מתעדכן, שם חדש נוסף.',
    'המערכת שומרת את המספרים האישיים כגיבוב בלבד ואינה מציגה אותם שוב, לכן כדאי למסור לכל עובד/ת את המספר שלו/ה.',
    'קובץ ממולא מכיל מידע אישי: לשמור אותו במקום מוגן, ולמחוק אותו אחרי הייבוא.',
]
for i, text in enumerate(legend, start=1):
    c = ws.cell(row=i, column=6, value=text)
    c.font = bold if i == 1 else Font(name='Arial', size=10, color='445162')
    c.alignment = Alignment(horizontal='right', vertical='center')

for col, width in zip('ABCDEF', (22, 16, 38, 26, 3, 96)):
    ws.column_dimensions[col].width = width
ws.freeze_panes = 'A2'
wb.save(OUT)
print('saved', OUT)
