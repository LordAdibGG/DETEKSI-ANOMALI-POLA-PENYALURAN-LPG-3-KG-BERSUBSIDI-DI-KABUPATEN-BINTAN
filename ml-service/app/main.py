"""Alias modul agar baik `uvicorn main:app` maupun `uvicorn app.main:app` dapat dijalankan."""

from main import app

__all__ = ["app"]
