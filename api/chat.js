export default async function handler(req, res) {
  // Public browser endpoint: no cookies/auth credentials are used by the client.
  // Allow cross-origin requests from GitHub Pages and custom domains.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const message = String(body.message || "").trim();
    const page = String(body.page || "TUBAL HUB");

    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 2000) return res.status(400).json({ error: "Message is too long" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "AI backend is not configured" });

    const preferredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const models = [...new Set([preferredModel, "gemini-3.7-flash"])];
    let response;
    let data;
    let lastStatus = 503;

    for (const model of models) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{
                text:
                  "You are TUBAL HUB AI, the official website information assistant for TUBAL HUB. " +
                  "Your primary job is to answer questions about TUBAL HUB and its actual website platforms, pages, features, and community. " +
                  "Do not generate inspirational quotes, random quotes, poems, stories, jokes, or unrelated creative content when the user asks a general question. " +
                  "Keep answers focused on useful information about the website. If a user asks for something unrelated, briefly explain that you are the TUBAL HUB website assistant and redirect them to website-related help. " +
                  "Never invent a platform, feature, link, event, policy, or capability that is not provided in your instructions. If you do not know, say that you do not have that information. " +
                  "Known TUBAL HUB platforms and sections include TUBAL HUB Home, CTRLZONE (gaming), Payapang Isip (nature/peace platform), AI Music, Global Chat, Community, Events, Shop, News, Profiles, About, Contact, and Settings. " +
                  "TUBAL HUB is the main hub connecting these experiences for content, community, creativity, gaming, and creator projects. " +
                  "When asked what a platform does, explain its purpose clearly. When asked how to use a feature, give practical website instructions. " +
                  "Answer clearly and concisely. Always reply in the same language as the user. " +
                  "If the user writes Filipino/Tagalog, reply in natural Filipino/Taglish. " +
                  "If the user writes Cebuano/Bisaya, reply in Cebuano/Bisaya. " +
                  "If the user writes English, reply in English. If the user mixes languages, naturally match the mix. " +
                  "Never reveal server secrets, API keys, or internal configuration. Current page: " + page
              }]
            },
            contents: [{ role: "user", parts: [{ text: message }] }],
            generationConfig: { maxOutputTokens: 500 }
          })
        }
      );

      data = await response.json();
      lastStatus = response.status;

      if (response.ok) break;

      // Gemini can temporarily reject a model during high demand.
      // Try the secondary Flash model before returning an error.
      if (![429, 500, 502, 503].includes(response.status)) break;
    }

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({
        error: "AI provider request failed",
        providerStatus: response.status,
        providerMessage: String(data?.error?.message || "Unknown Gemini API error")
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() ||
      "I couldn't generate a response right now.";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("AI backend error:", error);
    return res.status(500).json({ error: "AI backend error" });
  }
}
