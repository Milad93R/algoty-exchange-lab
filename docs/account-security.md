# Account lifecycle

Implemented 2026-09-08. Account settings live at `/account`.

- Registration requires a single-use email code before persisting credentials; guest ownership is retained.
- Forgotten passwords use email codes. Nonexistent emails receive the same successful response shape with an unusable random challenge.
- Profile name editing requires a registered session.
- Password changes require the current password, rotate the recovery code and replace all sessions.
- Email changes require the current password and a code delivered to the new address; only confirmation updates the address. Confirmation replaces all sessions.
- Session listing exposes public identifiers, creation/expiry times and the current-session marker, never token hashes. Users may revoke another session or all other sessions. The existing sign-out action removes the current session.
- Verification codes expire after 15 minutes, allow five attempts and are purpose-bound. Reset/change-email challenges are bound to the user and current password hash; stale challenges cannot change updated credentials. Consumption and account mutation share a transaction.
- Code send limits and authentication attempt limits apply. Requests to resend within 60 seconds are rejected.
- Existing private recovery-code access remains available. Existing accounts are not retroactively marked email-verified.

Email: Resend, verified `algoty.com`, `hello@algoty.com`. Credentials are private in `.runtime/mail.env`, loaded by `infra/start-v2.sh`. No credentials in this document.

Validation: bounded Gradle bootJar build; `python3 tests/account-security.py` exercises local API and mobile Playwright flows, including cookie rotation. Tests create their own synthetic account/challenges and clean them up. Browser test needs the existing magents Playwright installation. The test suite does not send emails. Actual Resend delivery was verified during email-registration setup.

Scope: self-service account management; no administrative user directory, account deletion, MFA, or social login is implied.
