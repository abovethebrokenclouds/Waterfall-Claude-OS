"""Serve the worker HTTP service: ``python -m render_worker`` (install ``server``).

Wires the production backends from env and starts uvicorn. Defaults to dry-run
rendering unless RENDER_DRY_RUN=0, so it is safe to boot without ffmpeg present.
"""

from __future__ import annotations

import os

from .app import create_app


def main() -> None:
    try:
        import uvicorn  # type: ignore import-not-found
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "uvicorn is not installed. Install the 'server' extra: "
            "pip install -e '.[server]'"
        ) from exc

    dry_run = os.environ.get("RENDER_DRY_RUN", "1") != "0"
    app = create_app(dry_run_render=dry_run)
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "5001")))  # noqa: S104


if __name__ == "__main__":  # pragma: no cover
    main()
