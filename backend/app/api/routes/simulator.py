from fastapi import APIRouter, Body, HTTPException

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
