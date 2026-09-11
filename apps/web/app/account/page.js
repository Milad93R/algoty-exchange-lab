"use client";
import GoogleSignIn from "../components/product/GoogleSignIn";
import AccountSettings from "../components/product/AccountSettings";
import ForgotPassword from "../components/product/ForgotPassword";
import {BrandMark} from "../components/Brand";
import { useState, useEffect } from "react";
import { api, useUser, Shell, Notice } from "../components/product/common";
export default function Account() {
  const { user, setUser, error } = useUser();
  const [mode, setMode] = useState("register"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [code, setCode] = useState("");
  const [pending,setPending]=useState(null);
  useEffect(()=>{const q=new URLSearchParams(window.location.search);if(q.get('google_error')){setNotice(q.get('google_error'));window.history.replaceState({},'',window.location.pathname)}},[]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const b = Object.fromEntries(new FormData(e.currentTarget));
      if(mode === "register" && !pending){
        const sent=await api("email-code",{email:b.email});
        setPending({...b,challenge:sent.challenge});
        setNotice("Check your inbox. Enter the six-digit code to finish creating your account.");
        return;
      }
      const d = await api(mode,pending && mode === "register"?{...pending,emailCode:b.emailCode}:b);
      setPending(null);
      setUser(d.user);
      setCode(d.recoveryCode || "");
      setNotice(
        mode === "register"
          ? "Account saved. Your guest portfolio and missions are now linked to your login."
          : mode === "recover"
            ? "Access restored. Save your new recovery code."
            : "Welcome back.",
      );
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell user={user}>
      <div className="auth-layout">
        <div className="auth-story">
          <span className="overline">YOUR SPACE IN THE MARKET</span>
          <h1>
            A little curious.
            <br />A lot more
            <br />
            in control<span>.</span>
          </h1>
          <p>
            Keep your portfolio, follow your missions and pick up exactly where
            you left off.
          </p>
          <div className="auth-mark"><BrandMark/></div>
          <p>
            Live markets. Virtual capital.
            <br />
            Every move belongs to you.
          </p>
        </div>
        <div className="auth-card">
          <Notice text={notice || error} clear={() => setNotice("")} />
          {user?.registered ? (
            <>
              <span className="overline">ACCOUNT</span>
              <h2>Hello, {user.name}.</h2>
              <p>{user.email}</p>
              {code && (
                <div className="recovery-code">
                  <strong>Your private recovery code</strong>
                  <p>
                    Save this somewhere safe. It restores access if you forget
                    your password. Email recovery is also available.
                  </p>
                  <code>{code}</code>
                  <button
                    className="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(code);
                      setNotice("Recovery code copied.");
                    }}
                  >
                    Copy recovery code ↗
                  </button>
                </div>
              )}
              <AccountSettings user={user} setUser={setUser} setCode={setCode} setNotice={setNotice}/>
              <div className="mission-actions">
                <a className="primary" href="/trade">
                  Open exchange ↗
                </a>
                <a className="secondary" href="/agents">
                  Your AI missions ↗
                </a>
              </div>
              <p className="micro-note">
                Sessions expire after seven days. Signing in on another device
                restores your saved account.
              </p>
              <button
                className="secondary danger-link"
                onClick={async () => {
                  await api("logout", {});
                  setCode("");
                  setUser(null);
                  window.location.href = "/account";
                }}
              >
                Sign out
              </button>
            </>
          ) : mode === "forgot" ? <ForgotPassword setNotice={setNotice} onBack={()=>{setMode("login");setNotice("")}} onDone={d=>{setUser(d.user);setCode(d.recoveryCode||"");setPending(null)}}/> : (
            <>
              <GoogleSignIn/>
              <p className="auth-divider">or continue with email</p>
              <div className="auth-tabs">
                {[
                  ["register", "Create account"],
                  ["login", "Sign in"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    className={mode === k ? "active" : ""}
                    onClick={() => {
                      setPending(null);
                      setMode(k);
                      setNotice("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h2>
                {mode === "recover"
                  ? "Find your way back."
                  : mode === "login"
                    ? "Welcome back."
                    : "Make it yours."}
              </h2>
              <form onSubmit={submit}>
                {pending ? <><label>Verification code for {pending.email}<input name="emailCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength="6" maxLength="6" required placeholder="Six-digit code"/></label><p className="micro-note">Expires in 15 minutes. Check your spam folder too.</p><button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const d=await api("email-code",{email:pending.email});setPending({...pending,challenge:d.challenge});setNotice("A new code is on its way.")}catch(e){setNotice(e.message)}finally{setBusy(false)}}}>Resend code</button><button type="button" className="secondary" onClick={()=>setPending(null)}>Change details</button></> : <>

                {mode === "register" && (
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      minLength="2"
                      maxLength="60"
                      required
                      placeholder="How should we call you?"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    maxLength="180"
                    placeholder="you@example.com"
                  />
                </label>
                {mode === "recover" && (
                  <label>
                    Recovery code
                    <input
                      name="recoveryCode"
                      autoComplete="off"
                      required
                      placeholder="The code saved when you registered"
                    />
                  </label>
                )}
                <label>
                  {mode === "recover" ? "New password" : "Password"}
                  <input
                    type="password"
                    name="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 10}
                    maxLength="128"
                    required
                    placeholder="At least 10 characters"
                  />
                </label>
                </>}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "One moment…"
                    : mode === "register"
                      ? (pending ? "Verify email & create account" : "Send verification code")
                      : mode === "login"
                        ? "Sign in"
                        : "Restore access"}{" "}
                  <span>↗</span>
                </button>
              </form>
              <p>
                {mode === "register"
                  ? "Your current guest balance, orders and missions stay with you. No deposit or payment details needed."
                  : mode === "recover"
                    ? "Enter the private code issued at registration. Restoring access rotates the code and signs out other sessions."
                    : "Sign in to your saved account. Your current guest session will be replaced."}
              </p>
              <button className="secondary" onClick={()=>{setPending(null);setMode("forgot");setNotice("")}}>Forgot password? Reset by email ↗</button>
              <button
                className="secondary"
                onClick={() =>
                  {setPending(null);setMode(mode === "recover" ? "login" : "recover")}
                }
              >
                {mode === "recover" ? "Back to sign in" : "Recover with a code"}{" "}
                ↗
              </button>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
