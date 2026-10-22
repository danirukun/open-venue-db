import json,glob
out={}
for f in glob.glob('tfl_*.json'):
  for s in json.load(open(f))['stopPoints']:
    st=s.get('stopType','')
    if st not in ('NaptanMetroStation','NaptanRailStation') and not (f.endswith('tram.json') and 'Tram' in st): continue
    n=s['commonName']
    for x in (' Underground Station',' Rail Station',' DLR Station',' Tram Stop'): n=n.replace(x,'')
    k=(n,round(s['lat'],3),round(s['lon'],3))
    o=out.setdefault(k,dict(name=n,net=set(),lines=set(),lat=s['lat'],lng=s['lon']))
    o['net'].update(s.get('modes',[])); o['lines'].update(l['name'] for l in s.get('lines',[]))
q=lambda v:"'"+v.replace("'","''")+"'"
rows=[f"({q(o['name'])},{q(','.join(sorted(o['net'])))},{q(','.join(sorted(o['lines']))[:300])},extensions.st_setsrid(extensions.st_makepoint({o['lng']},{o['lat']}),4326)::extensions.geography)" for o in out.values()]
sql="""create table if not exists stations(id bigserial primary key,name text not null,network text,lines text,geog extensions.geography(Point,4326) not null);
alter table stations enable row level security;
drop policy if exists stations_read on stations; create policy stations_read on stations for select using (true);
truncate stations;
insert into stations(name,network,lines,geog) values """+",\n".join(rows)+""";
create index if not exists stations_geog_idx on stations using gist(geog);
alter table venues add column if not exists nearest_station_name text, add column if not exists nearest_station_m int, add column if not exists transit_score int, add column if not exists crime_count_month int, add column if not exists safety_score int;
update venues v set nearest_station_name=n.name, nearest_station_m=round(n.d)::int,
 transit_score=least(100,greatest(0,round(case when n.d<=200 then 100 when n.d>=1500 then 0 else 100*(1500-n.d)/1300 end))::int + case when n.c>=2 then 10 else 0 end)
from (select v2.id, s.name, s.d, (select count(*) from stations s2 where extensions.st_dwithin(s2.geog,v2.geo,800)) c
  from venues v2 cross join lateral (select name, extensions.st_distance(s.geog,v2.geo) d from stations s order by s.geog <-> v2.geo limit 1) s where v2.geo is not null) n
where n.id=v.id;
select count(*) total, count(transit_score) with_transit, (select count(*) from stations) stations from venues;"""
open('transit.sql','w').write(sql);print(len(out),len(sql))
