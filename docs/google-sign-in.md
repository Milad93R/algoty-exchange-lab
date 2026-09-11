# Google sign-in — AlgoTy

Configured 2026-09-08 with AlgoTy's dedicated Google OAuth web client. Credentials live only in `.runtime/google.env`, loaded by `infra/start-v2.sh` for the Java core.

- Start: POST `/api/auth/google/start`; callback: `https://algoty.com/api/auth/google/callback`.
- Authorization code flow with S256 PKCE, nonce and one-use, ten-minute database state bound to a Secure/HttpOnly/SameSite=Lax browser cookie.
- Java exchanges the code and verifies the signed ID token with Spring Security Nimbus JWT decoder and Google's published keys. Checks include issuer, audience, authorized party when present, expiry, nonce and verified email. No Google access/refresh tokens are retained.
- Google subject is the durable identity. Existing email accounts are never automatically linked by matching email: sign in first, then use Connect Google with current-password confirmation and the matching Google email.
- New Google users retain their valid guest user ID and portfolio. Signing into an already linked account does not merge a separate guest portfolio.
- Google-only users can set a password through verified email recovery. Existing password login/recovery remains available. Changing the AlgoTy email disconnects Google and requires reconnecting.
- Missing/cancelled/expired callbacks redirect to a readable error on the account page. Successful callbacks rotate the AlgoTy session cookie; credentials are not included in redirect URLs.

Validation: bounded Java build, six JUnit tests against self-owned temporary QA accounts, full account-security/mobile browser regression suite. Public Continue with Google reaches Google's sign-in page without client/redirect configuration errors. A deliberately invalid authorization-code exchange returns invalid_grant rather than invalid_client. Missing-state callback fails closed. Final interactive Google consent/sign-in requires the account owner and has not been completed by the agent.

Google protocol reference: https://developers.google.com/identity/openid-connect/openid-connect
