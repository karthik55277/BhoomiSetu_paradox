import os
import sys
import time
import uuid
import re
from typing import Dict, List
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

UUID_REGEX = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Modern Content-Security-Policy suitable for SPA + WebSockets
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss:; "
            "img-src 'self' data: blob: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
        )
        return response


class RequestCorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming_id = request.headers.get("X-Request-ID")
        if incoming_id and UUID_REGEX.match(incoming_id):
            request_id = incoming_id
        else:
            request_id = str(uuid.uuid4())
            
        request.state.request_id = request_id
        start_time = time.time()
        
        response: Response = await call_next(request)
        
        duration_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        return response


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """
    In-memory sliding-window rate limiter per client IP.
    Note: Intended for single-instance container deployments (e.g. hackathon / standalone MVP).
    Multi-replica deployments require a shared store like Redis.
    """
    request_history: Dict[str, Dict[str, List[float]]] = {}

    def __init__(self, app):
        super().__init__(app)
        # Route specific limits: (max_requests, window_seconds)
        self.route_limits = {
            "/api/v1/auth/login": (60, 60),
            "/api/v1/documents/upload": (30, 60),
        }

    @classmethod
    def clear_history(cls):
        cls.request_history.clear()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self.route_limits:
            # Bypass rate limiting during test suite runs unless X-Test-Rate-Limit is passed
            is_pytest = "pytest" in sys.modules
            if is_pytest and "X-Test-Rate-Limit" not in request.headers:
                return await call_next(request)

            max_reqs, window_sec = self.route_limits[path]
            forwarded = request.headers.get("X-Forwarded-For")
            client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "127.0.0.1")
            now = time.time()

            if client_ip not in self.request_history:
                self.request_history[client_ip] = {}
            if path not in self.request_history[client_ip]:
                self.request_history[client_ip][path] = []

            timestamps = self.request_history[client_ip][path]
            # Prune timestamps outside window
            timestamps = [ts for ts in timestamps if now - ts < window_sec]
            self.request_history[client_ip][path] = timestamps

            if len(timestamps) >= max_reqs:
                oldest = timestamps[0]
                retry_after = int(window_sec - (now - oldest)) + 1
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."},
                    headers={"Retry-After": str(max(1, retry_after))}
                )
            
            timestamps.append(now)

        return await call_next(request)
