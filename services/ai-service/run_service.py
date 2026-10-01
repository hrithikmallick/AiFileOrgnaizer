"""PyInstaller entry point for the fully local FastAPI service."""

from app.config import get_settings
from app.main import app


def main() -> None:
    import uvicorn

    settings = get_settings()
    settings.validate_local_endpoints()
    uvicorn.run(app, host=settings.host, port=settings.port, log_level=settings.log_level.lower())


if __name__ == "__main__":
    main()
