import React from "react";
import { createRoot } from "react-dom/client";
import OccasionForm from "../OccasionForm.jsx";
import { PaymentCancelPage, PaymentSuccessPage, WishSharePage } from "./WishPages.jsx";
import "./main.css";

function App() {
  const { pathname } = window.location;

  if (pathname === "/payment/success") return <PaymentSuccessPage />;
  if (pathname === "/payment/cancel") return <PaymentCancelPage />;

  const shareMatch = pathname.match(/^\/view\/(wish_[a-f0-9]+)$/i);
  if (shareMatch) return <WishSharePage wishId={shareMatch[1]} />;

  async function handleSubmit(occasion) {
    const response = await fetch("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(occasion),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error ?? "Could not save your occasion.");
    }
    if (!result.checkoutUrl) throw new Error("Payment checkout could not be started.");

    window.location.assign(result.checkoutUrl);
  }

  return <OccasionForm onSubmit={handleSubmit} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);