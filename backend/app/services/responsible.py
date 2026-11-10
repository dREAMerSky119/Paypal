"""Responsible travel registry, evidence scoring and indicative carbon estimates."""
from app.services.seed import load_json


def registry(): return load_json('responsible_registry.json')
def weights(): return load_json('responsible_weights.json')
def factors(): return load_json('carbon_factors_2026.json')


def score_partner(partner):
    w = weights(); claims = partner.get('claims', [])
    verified = [c for c in claims if c.get('status') == 'verified' and c.get('evidence_url')]
    def has(kind): return any(c.get('type') == kind for c in verified)
    dimensions = {
      'local_ownership': 1.0 if has('local_ownership') and partner.get('ownership') in ('locally_owned','independent_local','family_run','cooperative') else 0.0,
      'certifications': 1.0 if any(c.get('type') == 'certification' and c.get('certification') in w.get('accepted_certifications', []) for c in verified) else 0.0,
      'community_benefit': 1.0 if has('community_benefit') else 0.0,
      'environmental_practice': 1.0 if has('environmental_practice') else 0.0,
    }
    score = round(sum(dimensions[k] * w[k] for k in dimensions))
    badge = score >= w['badge_threshold'] and bool(verified)
    return {'score': score, 'dimensions': {k: round(v*w[k]) for k,v in dimensions.items()}, 'weights': {k:w[k] for k in dimensions}, 'verified_claim_count':len(verified), 'badge_eligible':badge, 'badge': 'Verified responsible partner' if badge else None, 'evidence_trail':claims, 'explanation':'Only claims marked verified with an evidence URL contribute to the score. Sample seed records are not verified partners.'}


def carbon_estimate(payload):
    f=factors(); rates=f['factors']; country=payload.get('country','')
    flight_km=max(0,float(payload.get('flight_km',0))); rail_km=max(0,float(payload.get('rail_km',0)))
    road_km=max(0,float(payload.get('road_km',0))); nights=max(0,float(payload.get('hotel_nights',0)))
    parts={'flight':flight_km*rates['flight_long_haul']['value'],'rail':rail_km*rates['rail']['value'],'road':road_km*rates['road']['value'],'hotel':nights*rates['hotel']['value']}
    total=round(sum(parts.values()),2)
    # A rail alternative is offered when there is a flight segment; comparison is same distance.
    swap=None
    if flight_km > 0:
      alternative=flight_km*rates['rail']['value']
      swap={'from':'Flight','to':'Rail (where a practical route exists)','estimated_saving_kg_co2e':round(max(0,parts['flight']-alternative),2),'note':'Indicative same-distance comparison; rail availability and actual route distance must be checked.'}
    coverage=f['country_coverage'].get(country,'approximate: proxy factors used; no destination-specific factor mapping is configured')
    return {'total_kg_co2e':total,'breakdown_kg_co2e':{k:round(v,2) for k,v in parts.items()},'factor_year':f['factor_year'],'source':f['source'],'source_url':f['source_url'],'country':country,'coverage':coverage,'is_approximate':True,'disclaimer':f['disclaimer'],'swap_suggestion':swap}
