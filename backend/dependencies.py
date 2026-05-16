"""
FastAPI dependency: extract + validate Bearer token from the request.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select

from auth import decode_token
from database import get_session, Operator

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_operator(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    token: str = None,
    session: Session = Depends(get_session),
) -> Operator:
    actual_token = credentials.credentials if credentials else token

    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(actual_token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    officer_id: str = payload.get("sub")
    if not officer_id:
        raise HTTPException(status_code=401, detail="Malformed token")

    operator = session.exec(
        select(Operator).where(Operator.officer_id == officer_id)
    ).first()

    if not operator or not operator.is_active:
        raise HTTPException(status_code=401, detail="Operator not found or inactive")

    return operator
