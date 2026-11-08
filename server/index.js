import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import Stripe from "stripe";

const MONGODB_URI = process.env.MONGO_URI ?? process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB ?? "wishwithuzeey";
const API_PORT = process.env.PORT ?? process.env.API_PORT ?? "5000";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_CURRENCY = process.env.PAYMENT_CURRENCY ?? process.env.STRIPE_CURRENCY ?? "pkr";
const PAYMENT_AMOUNT_MINOR = process.env.PAYMENT_AMOUNT ?? process.env.PAYMENT_AMOUNT_MINOR ?? "99900";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://127.0.0.1:5173";
const allowedThemes = new Set(["dark", "romantic", "aesthetic-glow"]);

if (!MONGODB_URI || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.error("MONGO_URI, STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET are required. Configure them in .env.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const paymentAmountMinor = Number(PAYMENT_AMOUNT_MINOR);

if (!Number.isSafeInteger(paymentAmountMinor) || paymentAmountMinor < 1) {
  console.error("PAYMENT_AMOUNT_MINOR must be a positive integer in the currency's minor unit.");
  process.exit(1);
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getAppBaseUrl(request) {
  const requestUrl = request.get("origin") ?? request.get("referer");
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
    } catch {
      // Fall back to the configured public application URL.
    }
  }
  return APP_BASE_URL.replace(/\/$/, "");
}

function isValidPhoto(photo) {
  if (!photo || typeof photo !== "object") return false;
  if (photo.kind === "url") return typeof photo.url === "string" && isWebUrl(photo.url);
  return photo.kind === "file"
    && typeof photo.name === "string"
    && typeof photo.type === "string"
    && photo.type.startsWith("image/")
    && Number.isFinite(photo.size)
    && photo.size >= 0;
}

async function startServer() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const wishes = db.collection("wishes");
  await wishes.createIndex({ id: 1 }, { unique: true });

  const app = express();

  app.post(["/api/webhook", "/api/webhooks/stripe"], express.raw({ type: "application/json" }), async (request, response) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(request.body, request.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.warn("Rejected Stripe webhook:", error.message);
      return response.status(400).send("Invalid webhook signature.");
    }

    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object;
      const wishId = session.metadata?.wishId;
      if (wishId && session.payment_status === "paid") {
        await wishes.updateOne(
          { id: wishId, paid: { $ne: true } },
          { $set: {
            paid: true,
            paidAt: new Date(),
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          } },
        );
      }
    }

    return response.json({ received: true });
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, database: MONGODB_DB });
  });

  app.post("/api/wishes", async (request, response) => {
    const { occasionTitle, message = "", theme, musicUrl = "", photos = [] } = request.body ?? {};
    const validMusicUrl = musicUrl === "" || (typeof musicUrl === "string" && isWebUrl(musicUrl));

    if (typeof occasionTitle !== "string" || !occasionTitle.trim() || occasionTitle.length > 80) {
      return response.status(400).json({ error: "Occasion title is required and must be 80 characters or fewer." });
    }
    if (typeof message !== "string" || message.length > 500) {
      return response.status(400).json({ error: "Message must be 500 characters or fewer." });
    }
    if (!allowedThemes.has(theme) || !validMusicUrl) {
      return response.status(400).json({ error: "Theme or music URL is invalid." });
    }
    if (!Array.isArray(photos) || photos.length > 20 || !photos.every(isValidPhoto)) {
      return response.status(400).json({ error: "Photos must contain up to 20 valid image references." });
    }

    const wish = {
      id: `wish_${randomUUID().replaceAll("-", "")}`,
      occasionTitle: occasionTitle.trim(),
      message: message.trim(),
      theme,
      musicUrl,
      photos,
      paid: false,
      createdAt: new Date(),
    };

    try {
      await wishes.insertOne(wish);
    } catch (error) {
      console.error("Could not save wish:", error);
      return response.status(500).json({ error: "Could not save the occasion." });
    }

    try {
      const session = await createCheckoutSession(wish, getAppBaseUrl(request));
      await wishes.updateOne({ id: wish.id }, { $set: { stripeCheckoutSessionId: session.id } });
      return response.status(201).json({ id: wish.id, checkoutUrl: session.url });
    } catch (error) {
      console.error("Could not create Stripe Checkout session:", error.message);
      return response.status(502).json({ error: "Your wish was saved, but payment could not be started. Please try again.", wishId: wish.id });
    }
  });

  app.post("/api/wishes/:id/checkout", async (request, response) => {
    const wish = await wishes.findOne({ id: request.params.id, paid: { $ne: true } });
    if (!wish) return response.status(404).json({ error: "Unpaid wish not found." });

    try {
      const session = await createCheckoutSession(wish, getAppBaseUrl(request));
      await wishes.updateOne({ id: wish.id }, { $set: { stripeCheckoutSessionId: session.id } });
      return response.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("Could not retry Stripe Checkout:", error.message);
      return response.status(502).json({ error: "Could not start payment. Please try again." });
    }
  });

  app.get("/api/wishes/:id/status", async (request, response) => {
    const wish = await wishes.findOne({ id: request.params.id }, { projection: { paid: 1 } });
    if (!wish) return response.status(404).json({ error: "Wish not found." });
    if (!wish.paid) return response.status(202).json({ paid: false });

    return response.json({ paid: true, shareUrl: `${getAppBaseUrl(request)}/view/${encodeURIComponent(request.params.id)}` });
  });

  app.get("/api/wishes/:id", async (request, response) => {
    const wish = await wishes.findOne(
      { id: request.params.id, paid: true },
      { projection: { _id: 0, id: 1, occasionTitle: 1, message: 1, theme: 1, musicUrl: 1, photos: 1, createdAt: 1 } },
    );
    if (!wish) return response.status(404).json({ error: "Paid wish not found." });
    return response.json({ ...wish, createdAt: wish.createdAt.toISOString() });
  });

  app.listen(Number(API_PORT), "127.0.0.1", () => {
    console.log(`MongoDB API listening at http://127.0.0.1:${API_PORT}`);
  });

  async function createCheckoutSession(wish, appBaseUrl) {
    return stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: wish.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: STRIPE_CURRENCY.toLowerCase(),
          unit_amount: paymentAmountMinor,
          product_data: { name: "Wish with Uzeey occasion link" },
        },
      }],
      metadata: { wishId: wish.id },
      success_url: `${appBaseUrl}/payment/success?wishId=${encodeURIComponent(wish.id)}`,
      cancel_url: `${appBaseUrl}/payment/cancel?wishId=${encodeURIComponent(wish.id)}`,
    });
  }
}

startServer().catch((error) => {
  console.error("Could not connect to MongoDB:", error.message);
  process.exit(1);
});