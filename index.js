const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: 'essenbot_verify_2026',
  ACCESS_TOKEN: process.env.ACCESS_TOKEN || process.env.TOKEN_DE_ACCESO,
  APP_SECRET: process.env.APP_SECRET,
  IG_ACCOUNT_ID: process.env.IG_ACCOUNT_ID || process.env.ID_DE_CUENTA_IG,
  POST_ID_PERMITIDO: process.env.POST_ID || 'DVzhIiGjP3O',
};

const KEYWORDS = [
  'quiero rosa', 'info', 'quiero info', 'información', 'informacion',
  'precio', 'precios', 'combo', 'combos', 'essen', 'rosa',
  'quiero', 'me interesa', 'consulta', '?', 'costo'
];

function getSaludo() {
  const now = new Date();
  const horaArgentina = (now.getUTCHours() - 3 + 24) % 24;
  if (horaArgentina >= 6 && horaArgentina < 12) return 'buenos días';
  if (horaArgentina >= 12 && horaArgentina < 19) return 'buenas tardes';
  return 'buenas noches';
}

const contactosAtendidos = new Set();
function esPrimerContacto(userId) {
  if (contactosAtendidos.has(userId)) return false;
  contactosAtendidos.add(userId);
  return true;
}

async function getNombreUsuario(userId) {
  try {
    const res = await axios.get(`https://graph.instagram.com/v21.0/${userId}`, {
      params: { fields: 'name,username', access_token: CONFIG.ACCESS_TOKEN }
    });
    return res.data.name || res.data.username || '';
  } catch (e) { return ''; }
}

async function responderComentarioPublico(commentId, nombre) {
  const mensaje = nombre
    ? `¡Hola ${nombre}! Te enviamos un mensaje privado 🤗`
    : `¡Hola! Te enviamos un mensaje privado 🤗`;
  try {
    await axios.post(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
      message: mensaje,
      access_token: CONFIG.ACCESS_TOKEN
    });
    console.log(`✅ Respuesta pública enviada a ${nombre || 'usuario'}`);
  } catch (e) {
    console.error('❌ Error en respuesta pública:', e.response?.data || e.message);
  }
}

async function enviarPrivateReply(commentId, nombre) {
  const saludo = getSaludo();
  const nombreTexto = nombre ? `, ${nombre}` : '';
  const mensaje = `🤩 ¡Hola${nombreTexto}, muy ${saludo}! ¿Cómo estás?\n\nMi nombre es Brenda. Para poder asesorarte mejor, contame:\n\n✨ ¿Ya tenés alguna pieza Essen en casa?\n✨ ¿Conocés la marca?\n✨ ¿Qué piezas de la línea Rosa te interesan?`;
  try {
    await axios.post(`https://graph.instagram.com/v21.0/${CONFIG.IG_ACCOUNT_ID}/messages`, {
      recipient: { comment_id: commentId },
      message: { text: mensaje },
      access_token: CONFIG.ACCESS_TOKEN
    });
    console.log(`✅ Private Reply enviado`);
  } catch (e) {
    console.error('❌ Error en Private Reply:', e.response?.data || e.message);
  }
}

async function enviarDM(userId, nombre) {
  const saludo = getSaludo();
  const nombreTexto = nombre ? `, ${nombre}` : '';
  const mensaje = `🤩 ¡Hola${nombreTexto}, muy ${saludo}! ¿Cómo estás?\n\nMi nombre es Brenda. Para poder asesorarte mejor, contame:\n\n✨ ¿Ya tenés alguna pieza Essen en casa?\n✨ ¿Conocés la marca?\n✨ ¿Qué piezas de la línea Rosa te interesan?`;
  try {
    await axios.post(`https://graph.instagram.com/v21.0/${CONFIG.IG_ACCOUNT_ID}/messages`, {
      recipient: { id: userId },
      message: { text: mensaje },
      access_token: CONFIG.ACCESS_TOKEN
    });
    console.log(`✅ DM enviado a ${userId}`);
  } catch (e) {
    console.error('❌ Error enviando DM:', e.response?.data || e.message);
  }
}

function contieneKeyword(texto) {
  if (!texto) return false;
  const textoLower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return KEYWORDS.some(kw => textoLower.includes(kw));
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    console.log('✅ Webhook verificado por Meta');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'instagram') return;

  for (const entry of body.entry || []) {

    for (const change of entry.changes || []) {
      if (change.field === 'comments') {
        const comentario = change.value;
        const texto = comentario.text || '';
        const userId = comentario.from?.id;
        const commentId = comentario.id;
        const mediaShortcode = comentario.media?.shortcode || '';

        // 🚫 IGNORAR comentarios de la propia cuenta
        if (userId === CONFIG.IG_ACCOUNT_ID) {
          console.log(`⛔ Comentario propio ignorado`);
          continue;
        }

        // 🚫 IGNORAR si no es el post de la campaña
        if (mediaShortcode && mediaShortcode !== CONFIG.POST_ID_PERMITIDO) {
          console.log(`⛔ Post ignorado: ${mediaShortcode}`);
          continue;
        }

        if (contieneKeyword(texto)) {
          console.log(`💬 Keyword detectada de ${userId}: "${texto}"`);
          const nombre = await getNombreUsuario(userId);
          await responderComentarioPublico(commentId, nombre);
          await new Promise(r => setTimeout(r, 1000));
          await enviarPrivateReply(commentId, nombre);
        }
      }
    }

    for (const messaging of entry.messaging || []) {
      const senderId = messaging.sender?.id;
      if (senderId === CONFIG.IG_ACCOUNT_ID) continue;
      if (esPrimerContacto(senderId)) {
        console.log(`📩 Primer DM de ${senderId}`);
        const nombre = await getNombreUsuario(senderId);
        await enviarDM(senderId, nombre);
      }
    }
  }
});

app.get('/', (req, res) => res.send('🤖 EssenBot v5 activo!'));

app.get('/privacy', (req, res) => {
  res.send(`<html><head><meta charset="UTF-8"><title>Política de Privacidad - EssenBot</title></head><body><h1>Política de Privacidad - EssenBot</h1><p>EssenBot recopila únicamente nombre de usuario y mensajes para brindar atención al cliente de Mi Emprendimiento Essen. No compartimos datos con terceros. Contacto: crispe.digital@gmail.com</p></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 EssenBot v5 corriendo en puerto ${PORT}`));
