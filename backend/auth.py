
import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Cookie, HTTPException, Response, status
from pwdlib import PasswordHash

from database import SessionLocal
from models import User

load_dotenv()

SECRET_KEY = os.getenv("AUTH_SECRET_KEY")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

if not SECRET_KEY:
    raise RuntimeError("AUTH_SECRET_KEY is missing from the backend .env file.")

ALGORITHM = "HS256"
COOKIE_NAME = "nova_session"
SESSION_DURATION = timedelta(days=7)

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a password before storing it in the database."""
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a login password against its stored hash."""
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int) -> str:
    """Create a signed JWT for the authenticated user."""
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + SESSION_DURATION,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def set_auth_cookie(response: Response, user_id: int) -> None:
    """Store the JWT in a browser cookie inaccessible to JavaScript."""
    token = create_access_token(user_id)

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """Remove the session cookie during logout."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )


def get_current_user(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> User:
    """Validate the session cookie and return its user."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise unauthorized

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.isdigit():
            raise unauthorized

        user_id = int(subject)

    except jwt.InvalidTokenError:
        raise unauthorized

    with SessionLocal() as db:
        user = db.query(User).filter(User.id == user_id).first()

        if user is None:
            raise unauthorized

        return user
