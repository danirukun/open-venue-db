import json,re,sys,time,requests,concurrent.futures as cf
t=open(sys.argv[1]).read().replace('\\"','"'); cells=[dict(gy=int(a),gx=int(b)) for a,b in re.findall(r'"gy":(-?\d+),"gx":(-?\d+)',t)]
cells.sort(key=lambda c:min(((c['gy']+.5)*.009-51.4927)**2+((c['gx']+.5)*.0144+0.2240)**2*0.4,((c['gy']+.5)*.009-51.513)**2+((c['gx']+.5)*.0144+0.12)**2*0.4))
month=requests.get('https://data.police.uk/api/crimes-street-dates',timeout=20).json()[0]['date']
print('month',month,'cells',len(cells),flush=True)
dl=time.time()+200; out={}
def f(c):
  if time.time()>dl: return
  y0,x0=c['gy']*.009,c['gx']*.0144;y1,x1=y0+.009,x0+.0144
  poly=f"{y0},{x0}:{y0},{x1}:{y1},{x1}:{y1},{x0}"
  for a in range(3):
    try:
      r=requests.get('https://data.police.uk/api/crimes-street/all-crime',params={'poly':poly,'date':month},timeout=25)
      if r.status_code==429: time.sleep(1+a);continue
      if r.ok: out[(c['gy'],c['gx'])]=len(r.json()); return
    except Exception: pass
with cf.ThreadPoolExecutor(10) as ex: list(ex.map(f,cells))
print('done',len(out),flush=True)
vals=",".join(f"({k[0]},{k[1]},{v})" for k,v in out.items())
open('crime.sql','w').write(f"""create table if not exists crime_cells(gy int,gx int,month text,crime_count int,primary key(gy,gx,month));
alter table crime_cells enable row level security; drop policy if exists crime_read on crime_cells; create policy crime_read on crime_cells for select using (true);
insert into crime_cells values {",".join(f"({k[0]},{k[1]},'{month}',{v})" for k,v in out.items())} on conflict (gy,gx,month) do update set crime_count=excluded.crime_count;
create table if not exists data_sources(name text primary key, note text, updated_at timestamptz default now());
insert into data_sources(name,note) values ('police.uk street crime','data.police.uk crimes-street all-crime, month {month}, ~1km cells (0.009 lat x 0.0144 lng) containing venues; {len(out)} cells. Contains public sector information licensed under OGL v3.0.') on conflict (name) do update set note=excluded.note, updated_at=now();
alter table data_sources enable row level security; drop policy if exists ds_read on data_sources; create policy ds_read on data_sources for select using (true);
with c as (select gy,gx,crime_count, percent_rank() over (order by crime_count) pr from crime_cells where month='{month}')
update venues v set crime_count_month=c.crime_count, safety_score=round(100*(1-c.pr))::int from c where floor(v.lat/0.009)::int=c.gy and floor(v.lng/0.0144)::int=c.gx;
select count(safety_score) covered, count(*) total from venues;""")
