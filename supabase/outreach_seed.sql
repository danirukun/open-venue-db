insert into venue_requests(id,event_type,headcount,budget_gbp,flexible_days,lat,lng,radius_m,must_have,status)
values ('00000000-0000-4000-8000-000000000001','community tech meetup',45,0,array['We'],51.5255,-0.0785,1500,array['projector'],'open') on conflict (id) do nothing;
delete from outreach_drafts where request_id='00000000-0000-4000-8000-000000000001' and status='pending_approval';
insert into outreach_drafts(venue_id,request_id,channel,to_contact,subject,body,status) values ('osm-4620456890','00000000-0000-4000-8000-000000000001','website_contact','https://discountsuitcompany.co.uk/','Midweek event enquiry: 45 people, Wed evening','Hi Discount Suit Company team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 55 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-9990988898','00000000-0000-4000-8000-000000000001','website_contact','https://www.rosslyncoffee.com/','Midweek event enquiry: 45 people, Wed evening','Hi Rosslyn team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 57 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-10651215494','00000000-0000-4000-8000-000000000001','website_contact','https://zerotoonecoffee.co.uk','Midweek event enquiry: 45 people, Wed evening','Hi ZeroToOne Coffee team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 48 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-3010451545','00000000-0000-4000-8000-000000000001','website_contact','https://www.sagerandwilde.com/','Midweek event enquiry: 45 people, Wed evening','Hi Sager + Wilde team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 82 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-12570863801','00000000-0000-4000-8000-000000000001','website_contact','https://www.liftcoffeelondon.com/','Midweek event enquiry: 45 people, Wed evening','Hi Lift Coffee Shoreditch team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 89 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-7566420750','00000000-0000-4000-8000-000000000001','website_contact','https://www.subabakery.com/','Midweek event enquiry: 45 people, Wed evening','Hi Suba team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 85 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-13357808701','00000000-0000-4000-8000-000000000001','website_contact','https://littlefires.bar/','Midweek event enquiry: 45 people, Wed evening','Hi Little Fires team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 100 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval'),('osm-3154058988','00000000-0000-4000-8000-000000000001','website_contact','https://homeonravey.com/','Midweek event enquiry: 45 people, Wed evening','Hi Home Bar team,

I''m organising a community tech meetup for about 45 people and I''m looking for a Wed evening slot in the next few weeks. Our estimate puts your space at 50 people, which fits. We''d buy drinks at the bar and would love to know if a minimum-spend arrangement (rather than a hire fee) could work for a quiet midweek night.

What we''d need: space for 45, a screen or projector if you have one, and a finish by 22:30.

Your venue came up on Open Venue DB, an open community list of London venues. You can check or correct your listing (capacity, quiet nights, hire terms) here: {CLAIM_LINK}

Thanks,
{ORGANISER_NAME}

If you''d rather not get messages like this, reply "opt out" and we''ll remove your venue from outreach.','pending_approval');