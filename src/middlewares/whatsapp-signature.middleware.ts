import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { whatsappConfig, isWhatsappEnabled } from '../utils/whatsapp-config.js';

// The webhook has no JWT: Meta is the caller. Every call must carry X-Hub-Signature-256, an HMAC-SHA256 of the
// raw body with the App Secret. Unsigned or wrongly signed calls are rejected before anything is read.
// Needs the raw body (express.raw on this route, registered before express.json in index.ts).
export default (req: Request, res: Response, next: NextFunction) => {
    if (!isWhatsappEnabled()) return res.sendStatus(404);

    const rawBody = req.body;
    const header = req.get("x-hub-signature-256") ?? "";
    if (!Buffer.isBuffer(rawBody) || !header.startsWith("sha256=")) return res.sendStatus(401);

    const expected = Buffer.from(createHmac("sha256", whatsappConfig.appSecret).update(rawBody).digest("hex"), "utf8");
    const received = Buffer.from(header.slice("sha256=".length), "utf8");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.sendStatus(401);

    try {
        req.body = JSON.parse(rawBody.toString("utf8"));
    } catch {
        return res.sendStatus(400);
    }

    next();
}
