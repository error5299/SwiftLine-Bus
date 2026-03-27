import express from "express";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import path from "path";
import { fileURLToPath } from "url";
import qrcode from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY || "",
});

app.post("/api/send-booking-confirmation", async (req, res) => {
  const { email, passengerName, ticketDetails, boardingCounter, droppingCounter, ticketId } = req.body;

  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    return res.status(500).json({ error: "Mailgun not configured" });
  }

  try {
    const qrCodeDataUrl = await qrcode.toDataURL(ticketId);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
        <h2 style="color: #1a5d94;">Booking Confirmation</h2>
        <p>Hello <strong>${passengerName}</strong>,</p>
        <p>Your booking is confirmed. Here are your ticket details:</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Ticket ID:</strong> ${ticketId}</p>
          <p><strong>Details:</strong> ${ticketDetails}</p>
          <p><strong>Boarding Counter:</strong> ${boardingCounter}</p>
          <p><strong>Dropping Counter:</strong> ${droppingCounter}</p>
        </div>
        <div style="text-align: center; margin-top: 20px;">
          <p>Scan this QR code at the counter:</p>
          <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 200px; height: 200px;" />
        </div>
        <p>Thank you for traveling with us!</p>
      </div>
    `;

    const data = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: `Booking System <postmaster@${process.env.MAILGUN_DOMAIN}>`,
      to: [passengerName ? `${passengerName} <${email}>` : email],
      subject: "Booking Confirmation - " + ticketId,
      html: html,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Mailgun error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Vite middleware setup
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
