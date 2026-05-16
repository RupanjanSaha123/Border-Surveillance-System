"""
Authentication router — Register, Verify OTP, and Login
"""
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlmodel import Session, select

from auth import verify_password, create_access_token, get_password_hash
from database import get_session, Operator
from schemas import LoginRequest, LoginResponse, RegisterRequest, VerifyOtpRequest
from config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


def send_otp_email(email: str, name: str, officer_id: str, otp: str):
    """Utility to send email in the background."""
    if not settings.SMTP_EMAIL or not settings.SMTP_PASSWORD:
        print(f"\n[EMAIL SIMULATION] To: {email}")
        print(f"[EMAIL SIMULATION] Subject: BSC-DOP Verification Code")
        print(f"[EMAIL SIMULATION] Body: Your verification code is: {otp}\n")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = settings.SMTP_EMAIL
        msg['To'] = email
        msg['Subject'] = "BSC-DOP Verification Code"
        
        html_body = f"""
        <html>
            <body style="font-family: sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 20px;">
                <div style="max-width: 600px; margin: auto; border: 1px solid #333; border-radius: 8px; padding: 30px;">
                    <h2 style="color: #facc15; border-bottom: 1px solid #333; padding-bottom: 10px;">Verification Code Required</h2>
                    <p>Hello Officer {name},</p>
                    <p>A new account registration was requested for ID: <strong>{officer_id}</strong>.</p>
                    <p style="font-size: 1.2em;">Your 6-digit verification code is:</p>
                    <div style="background-color: #1a1a1a; padding: 15px; text-align: center; font-size: 2em; letter-spacing: 5px; color: #facc15; border: 1px solid #444; border-radius: 4px; margin: 20px 0;">
                        {otp}
                    </div>
                    <p>This code will expire shortly. Do not share this code with anyone.</p>
                    <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;">
                    <p style="font-size: 0.8em; color: #666;">BSC-DOP Security Operations Center - Internal Distribution Only</p>
                </div>
            </body>
        </html>
        """
        msg.attach(MIMEText(html_body, 'html'))
        
        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_EMAIL, settings.SMTP_PASSWORD)
            server.send_message(msg)
            
        print(f"[EMAIL SUCCESS] OTP sent to {email}")
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send OTP: {e}")


@router.post("/register")
async def register(
    body: RegisterRequest, 
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session)
):
    if body.password != body.confirmPassword:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    officer_id = body.officerId.strip().upper()
    
    # Check if exists
    existing = session.exec(select(Operator).where(Operator.officer_id == officer_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Officer ID already registered")
    
    # Generate 6-digit OTP
    otp = ''.join(random.choices(string.digits, k=6))
    
    new_op = Operator(
        officer_id=officer_id,
        name=body.name,
        email=body.email,
        hashed_password=get_password_hash(body.password),
        otp=otp,
        is_verified=False,
        call_sign=f"RECRUIT {officer_id[-3:]}",
        unit_code="UNASSIGNED"
    )
    
    session.add(new_op)
    session.commit()
    
    # Schedule email in background task
    background_tasks.add_task(send_otp_email, body.email, body.name, officer_id, otp)
    
    return {"message": "Registration successful. Please verify OTP sent to email.", "officerId": officer_id}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest, session: Session = Depends(get_session)):
    officer_id = body.officerId.strip().upper()
    
    operator = session.exec(select(Operator).where(Operator.officer_id == officer_id)).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Officer not found")
    
    if operator.otp != body.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    operator.is_verified = True
    operator.otp = None 
    session.add(operator)
    session.commit()
    
    return {"message": "Account verified successfully. You can now login."}


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, session: Session = Depends(get_session)):
    officer_id = body.officerId.strip().upper()

    operator = session.exec(
        select(Operator).where(Operator.officer_id == officer_id)
    ).first()

    if not operator:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, operator.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not operator.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    if not operator.is_verified:
        raise HTTPException(status_code=403, detail="Account not verified. Please complete OTP verification.")

    access_token = create_access_token(data={"sub": operator.officer_id})

    return LoginResponse(
        access_token=access_token,
        officer_id=operator.officer_id,
        call_sign=operator.call_sign,
        unit_code=operator.unit_code,
        login_time=datetime.utcnow(),
    )

    operator = session.exec(
        select(Operator).where(Operator.officer_id == officer_id)
    ).first()

    if not operator:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, operator.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not operator.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    if not operator.is_verified:
        raise HTTPException(status_code=403, detail="Account not verified. Please complete OTP verification.")

    access_token = create_access_token(data={"sub": operator.officer_id})

    return LoginResponse(
        access_token=access_token,
        officer_id=operator.officer_id,
        call_sign=operator.call_sign,
        unit_code=operator.unit_code,
        login_time=datetime.utcnow(),
    )
