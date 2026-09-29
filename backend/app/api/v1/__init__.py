from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.users import router as users_router
from app.api.v1.grid import router as grid_router
from app.api.v1.stores import router as stores_router
from app.api.v1.pois import router as pois_router
from app.api.v1.reports import router as reports_router
from app.api.v1.geocode import router as geocode_router
from app.api.v1.scout_assignments import router as scout_assignments_router
from app.api.v1.properties import router as properties_router
from app.api.v1.studies import router as studies_router
from app.api.v1.tasks import router as tasks_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router, tags=["Health"])
api_v1_router.include_router(users_router, tags=["Users"])
api_v1_router.include_router(grid_router, tags=["Grid"])
api_v1_router.include_router(stores_router, tags=["Stores"])
api_v1_router.include_router(pois_router, tags=["POIs"])
api_v1_router.include_router(reports_router, tags=["Reports"])
api_v1_router.include_router(geocode_router, tags=["Geocode"])
api_v1_router.include_router(scout_assignments_router, tags=["Scout Assignments"])
api_v1_router.include_router(properties_router, tags=["Properties"])
api_v1_router.include_router(studies_router, tags=["Studies"])
api_v1_router.include_router(tasks_router, tags=["Tasks"])

