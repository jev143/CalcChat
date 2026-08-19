# CalcChat completion notes

## Fixed in this package
- Media uploads no longer write metadata to Firestore, avoiding the `PERMISSION_DENIED` failure caused by the custom CalcChat session not being a Firebase Auth identity.
- Upload ownership metadata is stored server-side in `uploads/.metadata/`.
- Media downloads verify the authenticated CalcChat session against the stored conversation participant list.
- Media responses use the stored MIME type and `private, no-store` caching.
- Incoming WebRTC calls now attach the remote stream to the audio element as well as video, so incoming voice audio can be heard.
- Exact Account-Code contact lookup remains in place.
- Existing profile/account endpoints, PIN handling and HttpOnly session handling are preserved.

## Verification
- `npm run lint` passed (`tsc --noEmit`) after the changes.
- A production Vite build was not reproducible in this Linux packaging environment because the uploaded `node_modules` contains Windows-specific native binaries. On Windows, reinstall dependencies before building.
- On Windows run:
  1. `npm install`
  2. `npm run lint`
  3. `npm run build`
  4. `npm run dev`
  5. Open `http://localhost:3000`

## Security limitation
This package improves the server-authorized media path, but it is not honestly labeled 100% production-secure: the app still uses custom CalcChat sessions while several chat/call Firestore operations are performed directly by the browser. Firebase Security Rules cannot authenticate that custom cookie as `request.auth`. Full Firebase hardening requires migrating those remaining browser Firestore operations to authenticated server APIs or Firebase Authentication.
