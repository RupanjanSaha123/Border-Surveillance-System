"""
FastAPI dependency: extract + validate Bearer token from the request.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select

from auth import decode_token
from database import get_session, Operator

bearer_scheme = HTTPBearer()


async def get_current_operator(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Operator:
    token = credentials.credentials
    payload = decode_token(token)

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
