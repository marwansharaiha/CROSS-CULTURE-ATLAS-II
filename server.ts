import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

app.post("/api/insights", async (req, res) => {
  const { name, type, countryName } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "Name and type are required" });
  }

  try {
    let locationContext = "";
    if (type === 'city') locationContext = `${name}, ${countryName}`;
    else if (type === 'region') locationContext = `${name} region, ${countryName}`;
    else locationContext = name;

    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `Act as a medical cultural consultant. For the ${type} of ${locationContext}, provide detailed information for a medical team.
        You MUST use Google Search to find the most up-to-date and authoritative data from Wikipedia, the World Bank, World Health Organization (WHO), and official national statistical bureaus or health ministries.
        
        CRITICAL: Research deeply into historical, cultural, and colonial linguistic legacies. For example, for Zanzibar, ensure both Swahili AND Arabic are captured. Look for minority languages that are significant in specific regions or cities.
        
        Return the data in JSON format with these fields:
        - dominantLanguages: array of the primary/majority languages spoken in this specific ${type}.
        - secondaryLanguages: array of secondary, minority languages, or significant dialects spoken in this specific ${type}.
        - languages: array of all languages mentioned above (combined).
        - religions: string describing predominant religions and their specific impact on medical care.
        - population: string with population size.
        - medicalConcerns: string describing specific cultural concerns for medical teams.
        - culturalFacts: string with one or two cultural facts.
        - sources: array of URL strings or names of the renowned sources used for this data (e.g., ["Wikipedia", "World Bank", "WHO"]).
        ${type === 'country' ? '- regionLanguages: (Optional) A JSON object mapping EVERY major region/state/province of this country to its primary spoken language. Use the exact standard English names (e.g., "Dodoma", "Arusha", "California") used in international map data (Natural Earth, GADM).' : ''}
        ${type === 'country' ? '- majorCities: (Optional) An array of objects for the top 30 major cities (including significant cultural hubs like Zanzibar for Tanzania), each with "name", "lat", "lng", and "primaryLanguage".' : ''}
        
        Be specific to the ${type} level if possible. If data is only available at the national level, specify that.` }] }],
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }] as any,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dominantLanguages: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Majority languages" },
            secondaryLanguages: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Minority/secondary languages" },
            languages: { type: Type.ARRAY, items: { type: Type.STRING } },
            religions: { type: Type.STRING },
            population: { type: Type.STRING },
            medicalConcerns: { type: Type.STRING },
            culturalFacts: { type: Type.STRING },
            sources: { type: Type.ARRAY, items: { type: Type.STRING } },
            regionLanguages: { 
              type: Type.OBJECT,
              description: "Map of ALL official subdivision names (states/provinces/regions) to their primary spoken language. Use names that match international map standards (Natural Earth, GADM).",
              additionalProperties: { type: Type.STRING }
            },
            majorCities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                  primaryLanguage: { type: Type.STRING, description: "The primary language spoken in this city." }
                },
                required: ["name", "lat", "lng", "primaryLanguage"]
              }
            }
          },
          required: ["dominantLanguages", "secondaryLanguages", "languages", "religions", "population", "medicalConcerns", "culturalFacts", "majorCities", "regionLanguages"]
        }
      }
    });

    const text = response.text;
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch insights" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
