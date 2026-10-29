# SETUP — backlink-agent

Har checklist. Har step ke saath exact command hai. Jo cheez aapke account se
hoti hai, main khud nahi kar sakta — wahi steps yahan hain.

Sabse pehle:

```powershell
cd D:\autofix\backlink-agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest tests -q          # 17 passed hona chahiye
```

Agar `Activate.ps1` blocked ho:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

---

## 1. Gmail OAuth (drafts + sending)

Scope sirf `gmail.compose` hai: drafts bana sakta hai, bhej sakta hai, poora
mailbox padh nahi sakta.

**1.1** https://console.cloud.google.com → naya project (ya maujooda).

**1.2** "APIs & Services → Library" → **Gmail API** → Enable.

**1.3** "APIs & Services → OAuth consent screen":
- User type: **External**
- App name: `backlink-agent`, support email: `support@breaklytix.site`
- Scopes: `https://www.googleapis.com/auth/gmail.compose`
- Test users: apna Gmail address add karein (app "Testing" mode mein reh sakta hai)

**1.4** "APIs & Services → Credentials → Create credentials → OAuth client ID":
- Application type: **Desktop app**
- Download JSON → save as `D:\autofix\backlink-agent\data\client_secret.json`
  (ye file gitignored hai)

**1.5** Libraries install + authorise:

```powershell
pip install google-api-python-client google-auth-oauthlib
python tools/gmail_auth.py --client-secret data/client_secret.json
```

Browser khulega → wahi Google account chunein jisse outreach bhejni hai →
Allow. Token yahan likha jayega: `data/gmail_token.json`.

**1.6** Verify:

```powershell
python -c "from pathlib import Path; p=Path('data/gmail_token.json'); print('token ok' if p.exists() and p.stat().st_size>100 else 'missing')"
python run.py --outreach-only --dry-run
```

Token kabhi chat/commit/issue mein na daalein. Revoke karna ho:
https://myaccount.google.com/permissions (aur local file delete kar dein).

> Sender `support@breaklytix.site` hai. Google account wo mailbox hona chahiye
> jis ke paas us address se bhejne ki permission ho (Workspace delegation ya
> "Send mail as" alias), warna Gmail `From` ko apne account se replace kar dega.

---

## 2. ANTHROPIC_API_KEY (AI email drafting)

Bina key ke agent deterministic template use karta hai — kaam karta hai, bas
zyada generic lagta hai.

```powershell
# session ke liye
$env:ANTHROPIC_API_KEY = "sk-ant-..."
# permanent (naya terminal)
setx ANTHROPIC_API_KEY "sk-ant-..."
```

`.env` file bhi chalti hai: `run.py` usse `KEY=VALUE` lines parh leta hai
(`backlink-agent/.env`, gitignored), aur asli environment variables ko override
nahi karta. Template `.env.example` mein maujood hai.

Install:

```powershell
pip install anthropic
```

Verify (key print nahi hoti):

```powershell
python -c "import os; print('key set' if os.environ.get('ANTHROPIC_API_KEY') else 'key missing')"
```

Draft generation Anthropic key ke saath phir bhi wahi validator pass karti hai:
invented numbers, price, superlatives → draft reject.

---

## 3. Search discovery (Brave ya Serper) — optional

Default `search.provider: none` hai. Iske bina prospecting sirf
`data/seeds.txt` + `data/backlinks/*.csv` + competitor gap se chalti hai.

**Serper** (https://serper.dev, free tier):

```powershell
$env:SERPER_API_KEY = "..."
```

**Brave** (https://api.search.brave.com/app/keys):

```powershell
$env:BRAVE_API_KEY = "..."
```

Phir `config.yaml`:

```yaml
search:
  provider: serper      # ya brave
  max_queries_per_run: 25
```

Verify:

```powershell
python -c "import yaml;c=yaml.safe_load(open('config.yaml',encoding='utf-8'));print('provider:',c['search']['provider'])"
python run.py --prospect-only
```

Google/DDG scraping jaan-boojh kar nahi hai — unke terms ke khilaf hai.

---

## 4. Playwright (directory forms) — optional

```powershell
pip install playwright
playwright install chromium
```

Verify:

```powershell
python -c "from playwright.sync_api import sync_playwright; print('playwright ok')"
```

Pehla run **dry-run** hai (fields fill + screenshot, submit nahi):

```powershell
python run.py --submit-directories
```

Asli submit sirf tab, jab aap ne `data/directories.yaml` mein us directory ko
`approved: true` kiya ho aur selectors bhar diye hon:

```powershell
python run.py --submit-directories --live --only SaaSHub
```

Captcha ya email-verification par script ruk kar aapka ENTER maangta hai. Wo
khud solve nahi karta.

---

## 5. Competitor gap (aapke input ka intezaar)

```powershell
# 1) config.yaml mein asli competitors
notepad config.yaml
```

```yaml
competitor_domains:
  - competitor-one.com
  - competitor-two.io
```

```powershell
# 2) Ahrefs/Semrush/Moz ka backlinks export yahan rakhein
#    columns: source_url, target_url (case-insensitive, kai naam chalte hain)
explorer data\backlinks\
python run.py --prospect-only
```

Verify:

```powershell
python -c "import json;d=json.load(open('data/competitor_gap.json',encoding='utf-8'));print(d['count'],'gap candidates')"
```

---

## 6. Final smoke test (sab steps ke baad)

```powershell
cd D:\autofix\backlink-agent
.\.venv\Scripts\Activate.ps1
python -m pytest tests -q
python run.py --daily --dry-run
python run.py --daily                 # drafts banayega, bhejega nahi (AUTO_SEND=false)
```

Expected: `AUTO_SEND: False` banner, `sent today: 0 / 25`, drafts Gmail ke Drafts
folder mein (ya `data/drafts/*.eml` agar Gmail token nahi hai), report
`data/reports/YYYY-MM-DD.md`.

Sending tabhi on karein jab 10–15 drafts khud padh lein:

```yaml
AUTO_SEND: true
```

---

## Cheezein jo agent NAHI karta (dobara, taake checklist honest rahe)

- Reddit / Hacker News / Product Hunt ko email nahi karta
- captcha solve nahi karta
- email guess nahi karta (`first@domain.com` type)
- link farm / PBN / paid link marketplace par submit nahi karta
- backlink ya ranking ka dawa nahi karta; `link_live` sirf HTML mein `href`
  dekhne ke baad set hota hai
