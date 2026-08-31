# Class Schedules

A webapp for keeping all of your course schedules in one place: edit sessions, shift
classes when one gets cancelled (everything after it slides forward automatically), and
clone a previous semester into a new one with all dates recomputed from a new start
date. Includes a one-page, projector/print-friendly presentation view.

See [SETUP.md](SETUP.md) for how to connect Google sign-in and Firestore, and how to try
it locally first without any setup.

## Development

```
npm install
npm run dev     # local dev server (uses a local demo data store until Firebase is configured)
npm run test    # date-engine unit tests
npm run build   # production build
```
