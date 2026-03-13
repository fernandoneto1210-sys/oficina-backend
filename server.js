require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

const CATEGORY_TYPES = {
  turismo: "tourist_attraction",
  comer: "restaurant",
  ficar: "lodging",
  bares: "bar",
  compras: "shopping_mall",
};

app.get("/", function(req, res) {
  res.json({
    status: "oficina-backend rodando!",
    rotas: ["/buscar", "/detalhes/:placeId"],
  });
});

app.get("/buscar", async function(req, res) {
  const cidade = req.query.cidade;
  const categoria = req.query.categoria;

  if (!cidade) {
    return res.status(400).json({ erro: "Parametro cidade e obrigatorio." });
  }
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ erro: "GOOGLE_API_KEY nao configurada." });
  }

  const categoriaNormalizada = categoria || "turismo";
  const placeType = CATEGORY_TYPES[categoriaNormalizada] || CATEGORY_TYPES.turismo;

  try {
    console.log("Nova busca:", cidade, categoriaNormalizada);

    const geocodeRes = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: cidade,
          language: "pt-BR",
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (geocodeRes.data.status !== "OK" || !geocodeRes.data.results || !geocodeRes.data.results.length) {
      return res.status(404).json({ erro: "Cidade nao encontrada. Tente incluir o estado ou pais. Ex: Gramado, RS, Roma, Italia." });
    }

    const lat = geocodeRes.data.results[0].geometry.location.lat;
    const lng = geocodeRes.data.results[0].geometry.location.lng;
    const cidadeFormatada = geocodeRes.data.results[0].formatted_address;

    const placesRes = await axios.get(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      {
        params: {
          location: lat + "," + lng,
          radius: 5000,
          type: placeType,
          language: "pt-BR",
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (placesRes.data.status !== "OK" || !placesRes.data.results || !placesRes.data.results.length) {
      return res.status(404).json({ erro: "Nenhum lugar encontrado nessa categoria." });
    }

    const lugares = placesRes.data.results
      .map(function(place) {
        var photoRef = place.photos && place.photos[0] ? place.photos[0].photo_reference : null;
        var fotoUrl = photoRef
          ? "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=" + photoRef + "&key=" + GOOGLE_API_KEY
          : null;
        return {
          id: place.place_id,
          nome: place.name,
          endereco: place.vicinity,
          nota: place.rating || null,
          avaliacoes: place.user_ratings_total || 0,
          fotoUrl: fotoUrl,
          score: (place.rating || 0) * Math.log10((place.user_ratings_total || 1) + 1),
        };
      })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 15);

    return res.json({
      cidade: cidadeFormatada,
      categoria: categoriaNormalizada,
      lugares: lugares,
    });

  } catch (err) {
    console.error("Erro buscar:", err.message);
    return res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

app.get("/detalhes/:placeId", async function(req, res) {
  const placeId = req.params.placeId;

  if (!placeId) {
    return res.status(400).json({ erro: "placeId e obrigatorio." });
  }

  try {
    console.log("Detalhes:", placeId);

    const detailsRes = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: placeId,
          language: "pt-BR",
          fields: "name,formatted_address,formatted_phone_number,rating,user_ratings_total,opening_hours,photos,website,url,price_level,editorial_summary",
          key: GOOGLE_API_KEY,
        },
      }
    );

    console.log("Status Details:", detailsRes.data.status);

    if (detailsRes.data.status !== "OK") {
      return res.status(404).json({
        erro: "Detalhes nao encontrados.",
        detalhe: detailsRes.data.error_message || null,
      });
    }

    const p = detailsRes.data.result;

    const fotos = (p.photos || []).slice(0, 3).map(function(photo) {
      return "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=" + photo.photo_reference + "&key=" + GOOGLE_API_KEY;
    });

    var horarios = null;
    var aberto = null;
    if (p.opening_hours) {
      horarios = p.opening_hours.weekday_text || null;
      aberto = p.opening_hours.open_now != null ? p.opening_hours.open_now : null;
    }

    const precoMap = { 0: "Gratuito", 1: "Barato", 2: "Moderado", 3: "Caro", 4: "Muito caro" };
    const preco = p.price_level != null ? precoMap[p.price_level] : null;

    return res.json({
      nome: p.name,
      endereco: p.formatted_address,
      telefone: p.formatted_phone_number || null,
      nota: p.rating || null,
      avaliacoes: p.user_ratings_total || 0,
      aberto: aberto,
      horarios: horarios,
      preco: preco,
      website: p.website || null,
      maps_url: p.url || null,
      descricao: p.editorial_summary ? p.editorial_summary.overview : null,
      fotos: fotos,
    });

  } catch (err) {
    console.error("Erro detalhes:", err.message);
    return res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

app.listen(PORT, function() {
  console.log("oficina-backend rodando em http://localhost:" + PORT);
  console.log("Rotas: GET /buscar | GET /detalhes/:placeId");
});