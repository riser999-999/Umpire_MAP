import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    BSM_API_KEY: process.env.BSM_API_KEY ? "✅ gesetzt" : "❌ NICHT gesetzt",
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
