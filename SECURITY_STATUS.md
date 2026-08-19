# CalcChat security status

## Implemented in this build
- HttpOnly, SameSite=Strict server session cookie.
- Server-side authentication routes with basic rate limiting.
- Security response headers.
- Authenticated media upload/download authorization by conversation membership.
- Exact Account Code contact lookup only; no global identity directory.
- PIN changes and identity profile updates are server-mediated.
- Profile avatar allow-list and bounded profile text.
- No PIN hash is returned by the contact lookup endpoint.
- Account Code copy/profile UX and WhatsApp-style About + Status fields.

## Important production limitation
The current application still has Firebase Web SDK direct reads/writes for chats, contacts, conversations and WebRTC signaling. The repository's Firestore rules therefore cannot be changed to `request.auth != null` without migrating those operations to Firebase Authentication or authenticated server APIs. The existing custom Account Code session is not a Firebase Auth identity.

Therefore this build is **security-hardened**, but it must NOT be described as a fully production-secure WhatsApp replacement until Firestore/Storage authorization is migrated to authenticated Firebase/server-side access.

Before public deployment: configure Firebase Authentication, lock Firestore/Storage rules, use HTTPS, set a persistent strong SESSION_SECRET, and put the server behind a real rate limiter/WAF.

- New registrations/password recovery use scrypt-based account password hashing; legacy SHA-256 account hashes remain supported for compatibility until the account is recovered/rotated.
- Media responses are private/no-store rather than publicly cacheable.
