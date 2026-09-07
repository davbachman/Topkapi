"""Build native catalog data from the GPL Alhambra reference repository.
Usage: python3 scripts/import-catalog.py /path/to/Alhambra
No legacy file parser is shipped in the application.
"""
import sys,re,json,math,pathlib
source=pathlib.Path(sys.argv[1]); out={}
for file in sorted((source/'tiling/tilings').glob('*.tiling')):
 text=file.read_text(encoding='utf-8-sig',errors='replace')
 # Comments occur only outside quoted metadata in the supplied catalog.
 tokens=re.findall(r'"(?:\\.|[^"\\])*"|[^\s]+',text)
 pos=0
 def take():
  global pos
  v=tokens[pos];pos+=1;return v
 def number():return float(take())
 def point():return {'x':number(),'y':number()}
 def string():
  v=take()
  try:return json.loads(v)
  except:return v.strip('"')
 def matrix():return [number() for _ in range(6)]
 try:
  mode=take();name=string();count=int(take())
  if mode=='tiling':rep={'kind':'translation','u':point(),'v':point()}
  else:
   a,b,c,d=point(),point(),point(),point();tr=matrix() if mode=='inflation-tiling-2' else [number(),0,0,0,0,0]
   if mode!='inflation-tiling-2':tr[4]=tr[0]
   u=(b['x']-a['x'],b['y']-a['y']);v=(d['x']-c['x'],d['y']-c['y']);w=(c['x']-a['x'],c['y']-a['y']);cross=u[0]*v[1]-u[1]*v[0]
   t=(w[0]*v[1]-w[1]*v[0])/cross
   angle=math.acos(max(-1,min(1,(u[0]*v[0]+u[1]*v[1])/(math.hypot(*u)*math.hypot(*v)))))
   rep={'kind':'inflation','center':{'x':a['x']+t*u[0],'y':a['y']+t*u[1]},'sectors':round(2*math.pi/angle),'transform':tr,'rings':5}
  tiles=[]
  for i in range(count):
   kind=take();n=int(take());placements=int(take());regular=kind=='regular'
   pts=[{'x':math.cos(math.pi*(2*j+1)/n)/math.cos(math.pi/n),'y':math.sin(math.pi*(2*j+1)/n)/math.cos(math.pi/n)} for j in range(n)] if regular else [point() for _ in range(n)]
   tiles.append({'id':f't{i}','regular':regular,'points':pts,'placements':[matrix() for _ in range(placements)]})
  description=string() if pos<len(tokens) else '';author=string() if pos<len(tokens) else ''
  slug=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
  out[name]={'id':slug,'name':name,'description':description,'author':author,'tiles':tiles,'repetition':rep}
 except Exception as e:raise RuntimeError(f'{file}: {e}')
pathlib.Path('lib/engine/catalog.json').write_text(json.dumps(list(out.values()),ensure_ascii=False,separators=(',',':'))+'\n')
print('Imported',len(out),'tilings;',sum(t['repetition']['kind']=='inflation' for t in out.values()),'inflation tilings')
