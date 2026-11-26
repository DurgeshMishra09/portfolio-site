# Owner guide — editing your portfolio from the website

Visitors only ever see the finished site. You (and only you) can open a hidden editor on the live site, change anything, and save it.

## How it works
- All editable content (profile, projects, certificates, skills, journey, highlights, intro reel) lives in `src/data/content.json`.
- The hidden editor reads and writes that one file in your GitHub repository, using a token only you have. Your host (Cloudflare Pages / Netlify / Vercel / GitHub Pages) then redeploys the site, usually in 1–2 minutes.
- The hidden trigger is not the lock. The **token** is the lock: without it the editor cannot load or save anything, so a visitor who finds it can do nothing.

## One-time setup (about 3 minutes)
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → choose this portfolio repository.
3. Permissions → Repository permissions → **Contents: Read and write**. Set an expiry (e.g. 90 days).
4. Copy the token. Never paste it into the code or a chat. If it leaks, delete it on GitHub and make a new one.

## Opening the editor (hidden)
- Computer: press **Ctrl + Shift + E** (Mac: **Cmd + Shift + E**) while on the site. If your browser uses that shortcut, use the logo method.
- Phone or any device: tap the **logo (top-left) 5 times quickly**.
- Enter `owner/repository` (for example `DurgeshMishra09/portfolio`), the branch (`main`), and your token, then **Unlock**.

## Using it
- Left tabs: Profile, Education, Experience, Projects, Certificates, Skills, Journey, Highlights, Intro reel.
- Open any card to edit it. ↑ ↓ reorder, ⧉ duplicate, ✕ remove, **+ Add new item** adds a card with the same fields.
- **Upload** buttons (certificate link, resume, portrait) add the file to your repository and fill in its path.
- **Save to site** publishes the change. **Backup JSON** downloads a copy. **Discard** drops unsaved edits.
- Use "+ Website" / "+ Github" on a project to add its links later.

## Notes
- Uploaded files are saved to GitHub immediately; the text changes only go live when you press **Save to site**.
- Files up to 20 MB can be uploaded.
- If a save says the file changed on GitHub, close the editor, reopen it, and redo your last change.
- FinTrace Z has no GitHub/website link yet — add them from Projects → FinTrace Z.
