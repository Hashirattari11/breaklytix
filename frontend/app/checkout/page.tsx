"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CheckoutInner() {
  const params = useSearchParams();
  const txn = params.get("_ptxn");
  const [status, setStatus] = useState<string>("Loading checkout…");

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const env = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || "sandbox").toLowerCase();

    if (!token) {
      setStatus("Checkout is not configured yet. Please contact support@breaklytix.site.");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const Paddle = (window as any).Paddle;
      if (!Paddle) {
        setStatus("Failed to load Paddle.js.");
        return;
      }
      if (env === "sandbox" && typeof Paddle.Environment?.set === "function") {
        Paddle.Environment.set("sandbox");
      }
      Paddle.Initialize({
        token,
        checkout: {
          settings: {
            successUrl: `${window.location.origin}/dashboard/billing?success=true`,
          },
        },
      });
      if (txn) {
        Paddle.Checkout.open({ transactionId: txn });
        setStatus("Opening secure checkout…");
      } else {
        setStatus("No transaction to open. Please return to pricing and try again.");
      }
    };
    document.body.appendChild(script);

    return () => {};
  }, [txn]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Secure checkout</h1>
        <p className="text-slate-600">{status}</p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-slate-50"><p>Loading…</p></main>}>
      <CheckoutInner />
    </Suspense>
  );
}
