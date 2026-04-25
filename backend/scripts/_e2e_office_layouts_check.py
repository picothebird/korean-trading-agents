"""One-shot smoke test for office_layouts. Cleans up after itself."""
import asyncio
from datetime import datetime, timezone

from backend.core.mongodb import connect_to_mongo, close_mongo, get_mongo_database


async def main() -> None:
    await connect_to_mongo()
    db = get_mongo_database()
    coll = db["office_layouts"]
    user_id = "__e2e_test_user__"
    await coll.delete_many({"user_id": user_id})

    now = datetime.now(timezone.utc)
    r = await coll.insert_one({
        "user_id": user_id,
        "name": "E2E test",
        "map_id": "default-office",
        "theme": "neutral",
        "furniture": [{"asset_id": "desk_a", "x": 1.0, "y": 2.0, "rotation": 0, "layer": "floor"}],
        "characters": [],
        "notes": "",
        "is_active": True,
        "shared_token": None,
        "created_at": now,
        "updated_at": now,
    })
    print("inserted:", r.inserted_id)

    found = await coll.find_one({"_id": r.inserted_id})
    assert found and found["name"] == "E2E test"
    print("round-trip OK")

    await coll.update_many({"user_id": user_id, "is_active": True}, {"$set": {"is_active": False}})
    await coll.update_one({"_id": r.inserted_id}, {"$set": {"is_active": True}})
    actives = await coll.count_documents({"user_id": user_id, "is_active": True})
    print("actives after toggle:", actives)
    assert actives == 1

    # share-token issue/revoke
    await coll.update_one({"_id": r.inserted_id}, {"$set": {"shared_token": "test-token-xyz"}})
    shared = await coll.find_one({"shared_token": "test-token-xyz"})
    assert shared is not None
    print("shared GET OK")

    await coll.delete_many({"user_id": user_id})
    print("cleanup done")
    await close_mongo()


if __name__ == "__main__":
    asyncio.run(main())
