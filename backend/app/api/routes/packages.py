"""Package Builder API: quote, save, list, fetch. Logic lives in services/packages.py."""
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

from app.services import packages

router = APIRouter(tags=["packages"])


def _client_error(e: Exception) -> HTTPException:
    if isinstance(e, packages.PackageNotFound):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, packages.PackageRevisionConflict):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, (packages.PackageQuoteError, packages.PackageStoreError)):
        return HTTPException(status_code=400, detail=str(e))
    raise e


@router.post("/packages/quote")
def quote_package(payload: dict = Body(...)) -> dict:
    """Price a package without saving it. Never trusts client-supplied totals."""
    try:
        return packages.quote_package(payload)
    except (packages.PackageQuoteError, packages.PackageStoreError) as e:
        raise _client_error(e)


@router.post("/packages", status_code=201)
def create_package(payload: dict = Body(...)) -> dict:
    """Validate, price and persist a package; returns it with its id and revision."""
    try:
        return packages.save(payload)
    except Exception as e:
        raise _client_error(e)


@router.get("/packages")
def list_packages(
    destination: str | None = Query(None, max_length=64),
    q: str | None = Query(None, max_length=100),
) -> dict:
    return packages.list_packages(destination=destination, q=q)


@router.get("/packages/{package_id}")
def get_package(package_id: str) -> dict:
    found = packages.get(package_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Package not found")
    return found


@router.put("/packages/{package_id}")
def update_package(package_id: str, payload: dict = Body(...)) -> dict:
    """Save over an existing package. Send the `revision` you last read;
    a save from an older revision returns 409 instead of clobbering."""
    try:
        return packages.save(payload, package_id=package_id,
                              expected_revision=payload.get("revision"))
    except Exception as e:
        raise _client_error(e)


@router.delete("/packages/{package_id}", status_code=204)
def delete_package(package_id: str) -> None:
    if not packages.delete(package_id):
        raise HTTPException(status_code=404, detail="Package not found")


__all__: list[Any] = ["router"]
