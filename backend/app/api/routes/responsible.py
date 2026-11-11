<<<<<<< HEAD

from fastapi import APIRouter, HTTPException, Request
from app.services import responsible

router = APIRouter(tags=["responsible travel"])


@router.get("/responsible/partners")
def partners(destination: str | None = None, kind: str | None = None, q: str | None = None):
    return responsible.overview(destination=destination, kind=kind, query=q)


@router.get("/responsible/score/{item_id}")
def score(item_id: str):
    # Supplier ID returns a partner's scorecard; destination slug returns all
    # partners and the destination average.
    result = responsible.destination_detail(item_id)
    if result is not None:
        return result
    all_data = responsible.overview()
    partner = next((p for p in all_data["partners"] if p["id"] == item_id), None)
    if partner is not None:
        return partner
    raise HTTPException(status_code=404, detail="No matching destination or partner was found.")


@router.get("/responsible/package/{package_id}")
def package_impact(package_id: str):
    raise HTTPException(
        status_code=404,
        detail="This package has no saved transport and accommodation details to calculate an impact summary yet.",
    )


@router.post("/responsible/carbon")
async def carbon(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Please enter trip details using valid numbers.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Trip details must be submitted as a JSON object.")
    try:
        return responsible.calculate_carbon(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
=======
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from app.services.responsible import registry, score_partner, carbon_estimate, weights

router = APIRouter(prefix='/responsible', tags=['responsible-travel'])

class CarbonInput(BaseModel):
    country: str = ''
    flight_km: float = Field(0, ge=0, le=100000)
    rail_km: float = Field(0, ge=0, le=100000)
    road_km: float = Field(0, ge=0, le=100000)
    hotel_nights: float = Field(0, ge=0, le=3650)

@router.get('/partners')
def partners(destination: str | None = None, type: str | None = None, q: str | None = None):
    items=registry()
    if destination: items=[x for x in items if x['destination_slug']==destination]
    if type: items=[x for x in items if x['type']==type]
    if q:
      needle=q.casefold(); items=[x for x in items if needle in (x['name']+' '+x['destination']+' '+x['country']).casefold()]
    return {'count':len(items),'items':[dict(x, responsible_score=score_partner(x)) for x in items], 'is_sample':True}

@router.get('/score/{item_id}')
def partner_score(item_id: str):
    item=next((x for x in registry() if x['id']==item_id),None)
    if not item: raise HTTPException(404,'Responsible partner not found')
    return {'item_id':item_id,'name':item['name'],**score_partner(item)}

@router.post('/carbon')
def calculate_carbon(payload: CarbonInput):
    return carbon_estimate(payload.model_dump())

@router.get('/package/{package_id}')
def package_impact(package_id: str):
    # A stable seeded demonstration package; callers may use any id for a deterministic example.
    result=carbon_estimate({'country':'India','flight_km':1800,'rail_km':0,'road_km':120,'hotel_nights':4})
    partners=registry(); options=[p for p in partners if p['country']=='India' and p['type']=='community_experience']
    from app.services.demand_forecast import get_demand_forecast
    try:
        seasonal = get_demand_forecast('jaipur-india', 12).get('seasonality', [])
        quieter = sorted(seasonal, key=lambda row: row['index'])[:3]
        pressure = {'source':'Feature 6 demand seasonality model','data_origin':'synthetic_calibrated','shoulder_season_months':[row['month'] for row in quieter], 'note':'Directional shoulder-season nudge only; Feature 6 seasonality is synthetic calibrated demand, not verified visitor counts.'}
    except (ValueError, FileNotFoundError):
        pressure = {'source':'Feature 6 demand seasonality model','available':False,'note':'Seasonality data unavailable for this destination.'}
    pressure['inside_airbnb_density'] = {'available':False,'note':'No destination-matched Inside Airbnb density dataset is configured; no crowding claim is made.'}
    return {'package_id':package_id,'package_name':'India Highlights — sample package','carbon':result,'responsible_partner_suggestion':options[0] if options else None,'swap_suggestion':result['swap_suggestion'],'pressure_signals':pressure,'impact_summary':'Indicative sample itinerary impact. Choose a practical rail segment instead of a flight where the route, timing and accessibility work; select locally operated partners to direct more spend into the destination.','is_sample':True}

@router.get('/weights')
def scoring_weights(): return weights()
>>>>>>> fe70b5b (Add updated project files final one)
