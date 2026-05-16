"""
System settings router
  GET   /api/settings   — get current operational config
  PATCH /api/settings   — update config fields
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session, SystemSettings
from dependencies import get_current_operator
from schemas import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsRead)
def get_settings(
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    cfg = session.exec(select(SystemSettings)).first()
    if not cfg:
        raise HTTPException(status_code=500, detail="Settings not initialised")
    return cfg


@router.patch("", response_model=SettingsRead)
def update_settings(
    body: SettingsUpdate,
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    cfg = session.exec(select(SystemSettings)).first()
    if not cfg:
        raise HTTPException(status_code=500, detail="Settings not initialised")

    update_data = body.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(cfg, key, val)

    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg
