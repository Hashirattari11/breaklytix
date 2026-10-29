"""One-time Gmail OAuth for outreach.py - run this yourself, never share the token.

    pip install google-api-python-client google-auth-oauthlib
    python tools/gmail_auth.py --client-secret data/client_secret.json

What it does:
  1. opens a browser consent screen for the `gmail.compose` scope
  2. writes the refreshable token to data/gmail_token.json (gitignored)

`gmail.compose` is enough to create drafts and to send drafts. It cannot read
your whole mailbox, and this project never asks for a broader scope.

The token file is a credential. Do not paste it into chat, an issue, or a commit.
Delete data/gmail_token.json to revoke locally (and remove the app at
https://myaccount.google.com/permissions to revoke on Google's side).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Authorise Gmail for backlink-agent")
    parser.add_argument(
        "--client-secret",
        default="data/client_secret.json",
        help="OAuth client JSON downloaded from Google Cloud (Desktop app type)",
    )
    parser.add_argument(
        "--out",
        default="data/gmail_token.json",
        help="where to write the refreshable token (gitignored)",
    )
    parser.add_argument("--port", type=int, default=0, help="local redirect port (0 = pick one)")
    args = parser.parse_args(argv)

    secret = Path(args.client_secret).resolve()
    out = Path(args.out).resolve()

    if not secret.exists():
        print(f"client secret not found: {secret}", file=sys.stderr)
        print(
            "Google Cloud Console -> APIs & Services -> Credentials ->\n"
            "Create credentials -> OAuth client ID -> Desktop app -> download JSON.\n"
            "Save it as data/client_secret.json (it is gitignored).",
            file=sys.stderr,
        )
        return 2

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("missing dependency: pip install google-auth-oauthlib", file=sys.stderr)
        return 2

    out.parent.mkdir(parents=True, exist_ok=True)
    flow = InstalledAppFlow.from_client_secrets_file(str(secret), SCOPES)
    creds = flow.run_local_server(port=args.port, prompt="consent")

    out.write_text(creds.to_json(), encoding="utf-8")
    print(f"token written: {out}")
    print("scopes:", ", ".join(SCOPES))
    print("next: python run.py --outreach-only   (AUTO_SEND stays false = drafts only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
