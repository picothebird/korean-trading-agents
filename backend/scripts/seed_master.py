"""
마스터 사용자 계정을 시드하는 일회성 스크립트.

사용법 (PowerShell, 프로젝트 루트):
    cd c:\\Users\\summu\\Desktop\\hub\\korean-trading-agents
    python -m backend.scripts.seed_master \
        --email summust135@gmail.com \
        --username summust135 \
        --password sea135sea

이미 같은 이메일이 존재하면 role/disabled 만 보정합니다 (비밀번호는 --reset-password 가 있을 때만 갱신).
"""
from __future__ import annotations

import argparse
import asyncio

from backend.core.mongodb import close_mongo, connect_to_mongo, get_mongo_database
from backend.core.user_access import hash_password, normalize_role, utc_now


async def seed(email: str, username: str, password: str, role: str, reset_password: bool) -> None:
    await connect_to_mongo()
    try:
        db = get_mongo_database()
        email = email.strip().lower()
        norm_role = normalize_role(role)
        now = utc_now()

        existing = await db.users.find_one({"email": email})
        if existing:
            update: dict = {
                "role": norm_role,
                "disabled": False,
                "updated_at": now,
            }
            if reset_password:
                salt_hex, pw_hash = hash_password(password)
                update["password_salt"] = salt_hex
                update["password_hash"] = pw_hash
            await db.users.update_one({"_id": existing["_id"]}, {"$set": update})
            print(f"[seed_master] updated existing user '{email}' (role={norm_role}, password_reset={reset_password}).")
            return

        salt_hex, pw_hash = hash_password(password)
        doc = {
            "email": email,
            "username": username.strip() or email.split("@", 1)[0],
            "role": norm_role,
            "disabled": False,
            "password_salt": salt_hex,
            "password_hash": pw_hash,
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        }
        res = await db.users.insert_one(doc)
        print(f"[seed_master] created user '{email}' role={norm_role} _id={res.inserted_id}.")
    finally:
        await close_mongo()


def main() -> None:
    p = argparse.ArgumentParser(description="Seed (or upsert) a master user.")
    p.add_argument("--email", required=True)
    p.add_argument("--username", default="")
    p.add_argument("--password", required=True)
    p.add_argument("--role", default="master")
    p.add_argument("--reset-password", action="store_true", help="Reset password if user already exists.")
    args = p.parse_args()

    asyncio.run(
        seed(
            email=args.email,
            username=args.username or args.email.split("@", 1)[0],
            password=args.password,
            role=args.role,
            reset_password=bool(args.reset_password),
        )
    )


if __name__ == "__main__":
    main()
