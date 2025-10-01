# College Timetable Generator

This is a static web app (HTML/CSS/JS). It can be deployed easily to any static host including Vercel.

## Project structure

- `index.html`
- `styles.css`
- `app.js`
- `.gitignore`

## Quick start (local)

Just open `index.html` in a modern browser, or serve the folder with any static server.

Examples:
- Python 3: `python3 -m http.server 5173`
- Node (serve): `npx serve -l 5173 .`

Then open http://localhost:5173

## GitHub setup

1. Create a new empty repository on GitHub (do not initialize with README).
2. Ensure `.gitignore` is present (it excludes `server/`, `.env*`, `node_modules/`, etc.).
3. In a terminal, run:

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

If you accidentally committed something that should be ignored:
```bash
git rm -r --cached server
git commit -m "Remove server folder from repository"
git push
```

## Vercel deployment

1. Sign in to https://vercel.com (Continue with GitHub is easiest).
2. New Project → Import your GitHub repo.
3. Since this is a static site at the repo root, keep defaults and Deploy.
4. You’ll get a live URL like `https://your-project.vercel.app`.

If your app files are moved into a subfolder in future, set that folder as the project’s Root Directory in Vercel settings.