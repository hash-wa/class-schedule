# Setup

This app is a static site (React + Vite) hosted on GitHub Pages, with Firebase used for
Google sign-in and data storage (Firestore). You can run it locally right now with no
setup — it falls back to a browser-only demo data store until you connect Firebase.

## Try it locally first

```
npm install
npm run dev
```

Open the printed localhost URL. Since `src/firebaseConfig.ts` still has placeholder
values, the app runs on a local (`localStorage`) copy of a sample course so you can try
editing, cancelling classes, and cloning terms before touching Firebase. This data is
private to your browser and isn't shared with the deployed site.

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a
   new project (any name, e.g. "class-schedule").
2. Google Analytics is not needed — you can skip it.

## 2. Enable Google sign-in

1. In the Firebase console: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Google**.
3. Under **Settings → Authorized domains**, add `hash-sb.github.io` (and `localhost` is
   usually already there for local testing).

## 3. Create Firestore

1. **Build → Firestore Database → Create database**. Choose **production mode** and any
   region close to you.
2. Go to the **Rules** tab and paste in the contents of [firestore.rules](firestore.rules)
   from this repo (replace the placeholder email if you're not amin.alhashim@gmail.com).
   Click **Publish**.

## 4. Register a web app and copy the config

1. In **Project settings → General**, scroll to "Your apps" and click the web icon
   (`</>`) to register a new web app (no Firebase Hosting needed).
2. Copy the `firebaseConfig` object it gives you into
   [src/firebaseConfig.ts](src/firebaseConfig.ts), replacing the `REPLACE_ME` values.
   This file is safe to commit — it's not a secret (see the comment in that file).

## 5. Turn on GitHub Pages

1. In the GitHub repo: **Settings → Pages → Build and deployment → Source**, choose
   **GitHub Actions**.
2. Push to `main` — the included workflow at
   [.github/workflows/deploy.yml](.github/workflows/deploy.yml) will build and deploy
   automatically. The site will be published at `https://hash-sb.github.io/class-schedule/`.

## 6. Verify

- Open the deployed site: schedules should load with no sign-in required.
- Click "Sign in to edit" and sign in with amin.alhashim@gmail.com — the editor should
  unlock.
- Try signing in with a different Google account: editing should still be blocked
  (Firestore rules reject the write even if someone tampers with the client).
