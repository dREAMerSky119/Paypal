from fastapi import APIRouter, Body, HTTPException

from app.services import package_simulation, scenarios
from app.services.simulator import (
    SimulationError,
    get_assumptions,
    get_presets,
    run_simulation,
)

router = APIRouter()


@router.get("/simulator/assumptions")
def simulator_assumptions():
    """Sliders, events, global parameters and destinations. Every number is an editable assumption."""
    return get_assumptions()


@router.get("/simulator/presets")
def simulator_presets():
    """Ready-made scenarios (heavy monsoon, fuel +20%, INR -5%, festival season and more)."""
    return get_presets()


@router.post("/simulator/run")
def simulator_run(request: dict = Body(...)):
    """Run one scenario against the baseline demand forecast."""
    try:
        return run_simulation(request)
    except SimulationError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except FileNotFoundError as error:
        raise HTTPException(status_code=500, detail=str(error))


@router.post("/simulator/package-impact")
def simulator_package_impact(payload: dict = Body(...)):
    """Margin impact of one scenario on a saved package, month by month."""
    package_id = payload.get("package_id")
    if not isinstance(package_id, str) or not package_id:
        raise HTTPException(status_code=400, detail="package_id is required.")
    try:
        result = package_simulation.apply_to_package(package_id, payload.get("scenario") or {})
    except package_simulation.PackageSimulationError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if result is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return result


@router.post("/simulator/scenarios", status_code=201)
def simulator_save_scenario(payload: dict = Body(...)):
    """Save a scenario's inputs and get a shareable link path back."""
    try:
        return scenarios.save(payload.get("name"), payload.get("request"))
    except scenarios.ScenarioError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/simulator/scenarios/{scenario_id}")
def simulator_get_scenario(scenario_id: str):
    found = scenarios.get(scenario_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return found
