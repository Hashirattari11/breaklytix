"""Structured logging: console for humans, JSONL for the audit trail."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class Log:
    def __init__(self, log_dir: Path, verbose: bool = False) -> None:
        self.log_dir = log_dir
        self.verbose = verbose
        log_dir.mkdir(parents=True, exist_ok=True)
        self.path = log_dir / f"agent-{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"

    def _write(self, level: str, event: str, **fields: Any) -> None:
        record = {
            "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "level": level,
            "event": event,
        }
        record.update(fields)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")

    def info(self, event: str, **fields: Any) -> None:
        self._write("info", event, **fields)
        if self.verbose:
            print(f"[{event}] " + " ".join(f"{k}={v}" for k, v in fields.items()))

    def warn(self, event: str, **fields: Any) -> None:
        self._write("warn", event, **fields)
        print(f"! {event}" + (" " + " ".join(f"{k}={v}" for k, v in fields.items()) if fields else ""), file=sys.stderr)

    def error(self, event: str, **fields: Any) -> None:
        self._write("error", event, **fields)
        print(f"x {event}" + (" " + " ".join(f"{k}={v}" for k, v in fields.items()) if fields else ""), file=sys.stderr)

    def action(self, event: str, **fields: Any) -> None:
        """Things that touch the outside world (fetch, draft, send)."""
        self._write("action", event, **fields)
        print(f"- {event}" + (" " + " ".join(f"{k}={v}" for k, v in fields.items()) if fields else ""))
