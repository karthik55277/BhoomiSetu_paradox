"""Parcel Owners API routes."""

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.parcels import Parcel, ParcelOwner
from app.schemas_v1 import ParcelOwnerCreate, ParcelOwnerResponse, ParcelOwnerUpdate

router = APIRouter(tags=["owners"])


@router.get("/parcels/{parcel_id_or_code}/owners", response_model=List[ParcelOwnerResponse])
def get_parcel_owners(
    parcel_id_or_code: str,
    db: Session = Depends(get_db),
) -> List[ParcelOwnerResponse]:
    """Retrieve all owners for a specific land parcel."""
    parcel = find_parcel(db, parcel_id_or_code)
    owners = db.query(ParcelOwner).filter(ParcelOwner.parcel_id == parcel.id).order_by(ParcelOwner.created_at.asc()).all()
    return [ParcelOwnerResponse.model_validate(o) for o in owners]


@router.post("/parcels/{parcel_id_or_code}/owners", response_model=ParcelOwnerResponse, status_code=status.HTTP_201_CREATED)
def create_parcel_owner(
    parcel_id_or_code: str,
    payload: ParcelOwnerCreate,
    db: Session = Depends(get_db),
) -> ParcelOwnerResponse:
    """Add a new owner to a land parcel. Validates that the sum of ownership shares does not exceed 100%."""
    parcel = find_parcel(db, parcel_id_or_code)

    # Validate share percentages
    existing_owners = db.query(ParcelOwner).filter(ParcelOwner.parcel_id == parcel.id).all()
    total_existing_share = sum(float(o.share_percentage) for o in existing_owners)

    if total_existing_share + payload.share_percentage > 100.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ownership share: Existing shares total {total_existing_share:.2f}%. Adding {payload.share_percentage:.2f}% exceeds 100%.",
        )

    # If is_primary is set to True, adjust existing owners if necessary
    if payload.is_primary:
        for o in existing_owners:
            o.is_primary = False

    new_owner = ParcelOwner(
        parcel_id=parcel.id,
        owner_name=payload.owner_name,
        share_percentage=payload.share_percentage,
        is_primary=payload.is_primary,
        contact_phone=payload.contact_phone,
    )
    db.add(new_owner)
    db.commit()
    db.refresh(new_owner)
    return ParcelOwnerResponse.model_validate(new_owner)


@router.patch("/owners/{owner_id}", response_model=ParcelOwnerResponse)
def update_parcel_owner(
    owner_id: uuid.UUID,
    payload: ParcelOwnerUpdate,
    db: Session = Depends(get_db),
) -> ParcelOwnerResponse:
    """Update owner information and ownership share percentage with validation."""
    owner = db.query(ParcelOwner).filter(ParcelOwner.id == owner_id).first()
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Owner with ID '{owner_id}' not found.",
        )

    if payload.share_percentage is not None:
        other_owners = db.query(ParcelOwner).filter(
            ParcelOwner.parcel_id == owner.parcel_id,
            ParcelOwner.id != owner_id,
        ).all()
        other_shares = sum(float(o.share_percentage) for o in other_owners)

        if other_shares + payload.share_percentage > 100.01:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ownership share: Other shares total {other_shares:.2f}%. Updated share {payload.share_percentage:.2f}% exceeds 100%.",
            )
        owner.share_percentage = payload.share_percentage

    if payload.owner_name is not None:
        owner.owner_name = payload.owner_name
    if payload.contact_phone is not None:
        owner.contact_phone = payload.contact_phone
    if payload.is_primary is not None:
        if payload.is_primary:
            db.query(ParcelOwner).filter(
                ParcelOwner.parcel_id == owner.parcel_id,
                ParcelOwner.id != owner_id,
            ).update({"is_primary": False})
        owner.is_primary = payload.is_primary

    db.commit()
    db.refresh(owner)
    return ParcelOwnerResponse.model_validate(owner)


@router.delete("/owners/{owner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parcel_owner(
    owner_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    """Delete a parcel owner record."""
    owner = db.query(ParcelOwner).filter(ParcelOwner.id == owner_id).first()
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Owner with ID '{owner_id}' not found.",
        )
    db.delete(owner)
    db.commit()


def find_parcel(db: Session, identifier: str) -> Parcel:
    query = db.query(Parcel).filter(
        or_(
            func.lower(Parcel.parcel_id) == identifier.lower(),
            Parcel.id == (uuid.UUID(identifier) if is_valid_uuid(identifier) else None),
        )
    )
    parcel = query.first()
    if not parcel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{identifier}' not found.",
        )
    return parcel


def is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False
