import sys
from pathlib import Path

# Add backend directory to sys.path so app modules are resolvable
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, init_db
from app.db.models import User, UserRole

USERS_TO_SEED = [
    # BD Managers (Desktop)
    {
        "id": "usr_bdm_1",
        "name": "Arunachalam Muruganantham",
        "role": UserRole.BD_MANAGER,
    },
    {
        "id": "usr_bdm_2",
        "name": "Deepa Subramanian",
        "role": UserRole.BD_MANAGER,
    },
    # BD Executives (Mobile)
    {
        "id": "usr_bde_1",
        "name": "Karthik Raja",
        "role": UserRole.BD_EXECUTIVE,
    },
    {
        "id": "usr_bde_2",
        "name": "Sangeetha Natarajan",
        "role": UserRole.BD_EXECUTIVE,
    },
    # Survey Managers (Desktop)
    {
        "id": "usr_sm_1",
        "name": "Venkatesh Prasad",
        "role": UserRole.SURVEY_MANAGER,
    },
    {
        "id": "usr_sm_2",
        "name": "Meenakshi Sundaram",
        "role": UserRole.SURVEY_MANAGER,
    },
    # Survey Executives (Mobile)
    {
        "id": "usr_se_1",
        "name": "Saravanan Balaji",
        "role": UserRole.SURVEY_EXECUTIVE,
    },
    {
        "id": "usr_se_2",
        "name": "Kavitha Rajendran",
        "role": UserRole.SURVEY_EXECUTIVE,
    },
]


def seed_users():
    print("Ensuring database schema is initialized...")
    init_db()
    db = SessionLocal()
    try:
        created_count = 0
        updated_count = 0
        for u in USERS_TO_SEED:
            existing = db.query(User).filter(User.id == u["id"]).first()
            if existing:
                existing.name = u["name"]
                existing.role = u["role"]
                updated_count += 1
            else:
                user = User(id=u["id"], name=u["name"], role=u["role"])
                db.add(user)
                created_count += 1
        db.commit()
        print(f"Users seed complete: {created_count} created, {updated_count} updated. Total: {len(USERS_TO_SEED)} users.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding users: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_users()
