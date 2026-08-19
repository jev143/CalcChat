# CalcChat implementation status

Updated for local testing:
- New Chat now finds accounts only by exact Account Code; the global registered-user directory was removed from the UI.
- Account Code remains visible in the active account header and is shown in lookup results.
- Contact saving now uses the active identity and the selected target identity correctly.
- Media upload sends same-origin cookies explicitly (`withCredentials`) and keeps conversation authorization.
- Voice/video calls now attach a real remote audio element so voice is audible.
- Existing message, media, voice, and call flows were preserved rather than recreated.

Run:
- `npm install`
- `npm run lint`
- `npm run build`
- `npm run dev` then open `http://localhost:3000`
