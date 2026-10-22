update venues set lat=51.5234766,lng=-0.1232096 where id='v0055';
update venues set lat=51.5201004,lng=-0.1666628 where id='v0058';
update venues set lat=null,lng=null where id in ('v0041','v0082');
update venues set lat=null,lng=null where lat is not null and not (lat between 51.28 and 51.70 and lng between -0.52 and 0.34);
