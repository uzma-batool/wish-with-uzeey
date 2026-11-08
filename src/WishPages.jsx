import React, { useEffect, useState } from "react";
import "./WishPages.css";

function PageShell({ children }) {
  return <main className="wish-page-shell">{children}</main>;
}

export function PaymentSuccessPage() {
  const wishId = new URLSearchParams(window.location.search).get("wishId");
  const [state, setState] = useState({ kind: "checking" });

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    let timer;

    async function checkPayment() {
      if (!wishId) {
        setState({ kind: "error", message: "Payment return is missing the wish ID." });
        return;
      }

      attempts += 1;
      try {
        const response = await fetch(`/api/wishes/${encodeURIComponent(wishId)}/status`);
        const result = await response.json();
        if (stopped) return;

        if (response.ok && result.paid) {
          setState({ kind: "paid", shareUrl: result.shareUrl });
          return;
        }
        if (response.status !== 202) {
          setState({ kind: "error", message: result.error ?? "Could not confirm payment." });
          return;
        }
      } catch {
        if (!stopped) setState({ kind: "error", message: "Could not reach the payment server." });
        return;
      }

      if (attempts < 30) timer = window.setTimeout(checkPayment, 2000);
      else setState({ kind: "timeout" });
    }

    checkPayment();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [wishId]);

  const [copied, setCopied] = useState(false);

  async function copyShareLink() {
    await navigator.clipboard.writeText(state.shareUrl);
    setCopied(true);
  }

  return (
    <PageShell>
      <section className="payment-result" aria-live="polite">
        <p className="page-eyebrow">Wish with Uzeey</p>
        {state.kind === "checking" && <><div className="status-spinner" /><h1>Confirming your payment</h1><p>We are waiting for secure payment confirmation.</p></>}
        {state.kind === "paid" && <><div className="status-mark">✓</div><h1>Link Ready!</h1><p>Your payment is confirmed. Share this wish with family and friends.</p><div className="share-link-row"><a href={state.shareUrl}>{state.shareUrl}</a><button type="button" onClick={copyShareLink}>{copied ? "Copied" : "Copy link"}</button></div><a className="page-primary-link" href={state.shareUrl}>Open wish <span aria-hidden="true">→</span></a></>}
        {state.kind === "timeout" && <><h1>Still confirming</h1><p>Payment can take a moment to confirm. Refresh this page shortly to check again.</p></>}
        {state.kind === "error" && <><h1>Payment status unavailable</h1><p>{state.message}</p><a className="page-secondary-link" href="/">Back to create a wish</a></>}
      </section>
    </PageShell>
  );
}

export function PaymentCancelPage() {
  const wishId = new URLSearchParams(window.location.search).get("wishId");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function retryPayment() {
    if (!wishId) return setError("Wish ID is missing.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/wishes/${encodeURIComponent(wishId)}/checkout`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not restart payment.");
      window.location.assign(result.checkoutUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not restart payment.");
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <section className="payment-result">
        <p className="page-eyebrow">Wish with Uzeey</p>
        <h1>Payment was not completed</h1>
        <p>Your wish is saved, but its share link becomes available after payment.</p>
        {error && <p className="page-error" role="alert">{error}</p>}
        <button className="page-primary-button" type="button" onClick={retryPayment} disabled={busy}>{busy ? "Opening checkout..." : "Try payment again"}</button>
        <a className="page-secondary-link" href="/">Return to the form</a>
      </section>
    </PageShell>
  );
}

export function WishSharePage({ wishId }) {
  const [state, setState] = useState({ kind: "loading" });

  useEffect(() => {
    let stopped = false;
    fetch(`/api/wishes/${encodeURIComponent(wishId)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Wish not found.");
        return result;
      })
      .then((wish) => { if (!stopped) setState({ kind: "ready", wish }); })
      .catch((error) => { if (!stopped) setState({ kind: "error", message: error.message }); });

    return () => { stopped = true; };
  }, [wishId]);

  if (state.kind === "loading") return <PageShell><p className="share-loading">Opening your wish...</p></PageShell>;
  if (state.kind === "error") return <PageShell><section className="payment-result"><h1>Wish unavailable</h1><p>{state.message}</p></section></PageShell>;

  const { wish } = state;
  const theme = ["dark", "romantic", "aesthetic-glow"].includes(wish.theme) ? wish.theme : "romantic";
  const photoUrls = wish.photos.filter((photo) => photo.kind === "url").map((photo) => photo.url);

  return (
    <PageShell>
      <article className={`shared-wish theme-${theme}`}>
        <p className="page-eyebrow">A wish made just for you</p>
        <div className="shared-wish-art" aria-hidden="true">{theme === "dark" ? "◐" : theme === "romantic" ? "♡" : "✧"}</div>
        <p className="shared-wish-theme">{theme.replaceAll("-", " ")}</p>
        <h1>{wish.occasionTitle}</h1>
        {wish.message && <p className="shared-wish-message">{wish.message}</p>}
        {photoUrls.length > 0 && <div className="shared-wish-photos">{photoUrls.map((url) => <img src={url} alt="Wish memory" key={url} />)}</div>}
        {wish.musicUrl && <audio controls src={wish.musicUrl}>Your browser does not support audio playback.</audio>}
        <p className="shared-wish-signoff">Made with care ✳</p>
      </article>
    </PageShell>
  );
}