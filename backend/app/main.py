import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import init_db
from app.api.v1 import api_v1_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("savomart.sitescout")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Savo SiteScout backend...")
    try:
        init_db()
        logger.info("PostGIS database tables initialized successfully.")
    except Exception as e:
        logger.warning(f"Could not connect to database on startup: {e}. (Will retry on requests).")
    yield
    logger.info("Shutting down Savo SiteScout backend...")


app = FastAPI(
    title="Savo SiteScout API",
    description="Expansion intelligence platform for Savomart (grocery retail) in Chennai",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-User-Id"],
)

# Mount routes at root and /api for convenience
app.include_router(api_v1_router)
app.include_router(api_v1_router, prefix="/api")
