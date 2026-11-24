# tools/make_pdf.cjs が作った分割 PDF を科目ごとに結合し、分野・問題のしおりを付ける
#   python3 tools/merge_pdf.py pdf
import json,sys,re,glob,os
from pypdf import PdfWriter, PdfReader
out=sys.argv[1]
for mf in sorted(glob.glob(f'{out}/parts/*/manifest.json')):
    m=json.load(open(mf)); w=PdfWriter(); base=0; pos={}
    for k,f in enumerate(m['files']):
        r=PdfReader(f)
        ids=[p['id'] for p in m['problems'] if p['chunk']==k]; j=0
        for pi,pg in enumerate(r.pages):
            if j<len(ids):
                t=(pg.extract_text() or '')[:400]
                if ids[j] in t: pos[ids[j]]=base+pi; j+=1
        assert j==len(ids),(f,j,len(ids),ids[j] if j<len(ids) else None)
        w.append(r); base+=len(r.pages)
    cur=None; parent=None
    for p in m['problems']:
        if p['field']!=cur:
            cur=p['field']; parent=w.add_outline_item(cur,pos[p['id']])
        w.add_outline_item(f"{p['id']}  {p['theme']}",pos[p['id']],parent=parent)
    w.page_mode='/UseOutlines'
    dst=f"{out}/ぶつりば_{m['name']}.pdf"; w.write(dst)
    print(m['subject'],len(m['problems']),'問',base,'ページ',round(os.path.getsize(dst)/1e6,1),'MB')
