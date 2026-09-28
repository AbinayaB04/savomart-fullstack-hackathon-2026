from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.users import router as users_router
from app.api.v1.grid import router as grid_router
from app.api.v1.stores import router as stores_router
from app.api.v1.pois import router as pois_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router, tags=["Health"])
api_v1_router.include_router(users_router, tags=["Users"])
api_v1_router.include_router(grid_router, tags=["Grid"])
api_v1_router.include_router(stores_router, tags=["Stores"])
api_v1_router.include_router(pois_router, tags=["POIs"])
