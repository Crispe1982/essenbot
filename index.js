const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// CONFIGURACIÓN
// ==========================================
const CONFIG = {
  VERIFY_TOKEN: 'essenbot_verify_2026',
  ACCESS_TOKEN: process.env.ACCESS_TOKEN,
  APP_SECRET: process.env.APP_SECRET,
  IG_ACCOUNT_ID: process.env.IG_ACCOUNT_ID,
};

// ==========================================
// PALABRAS CLAVE QUE ACTIVAN EL BOT
// ==========================================
const KEYWORDS = [
  'quiero rosa', 'info', 'quiero info', 'información', 'informacion',
  'precio', 'precios', 'combo', 'combos', 'essen', 'rosa',
  'quiero', 'me interesa', 'consulta', '?', 'costo'
];

// ==========================================
// FUNCIÓN: OBTENER SALUDO SEGÚN HORARIO (Argentina UTC-3)
// ==========================================
function getSaludo() {
  const now = new Date();
  const horaArgentina = (now.getUTCHours() - 3 + 24) % 24;
  if (horaArgentina >= 6 && horaArgentina < 12) return 'buenos días';
  if (horaArgentina >= 12 && horaArgentina < 19) return 'buenas tardes';
  return 'buenas noches';
}

// ==========================================
// FUNCIÓN: VERIFICAR SI ES PRIMER CONTACTO
// ==========================================
const contactosAtendidos = new Set();

function esPrimerContacto(userId) {
  if (contactosAtendidos.has(userId)) return false;
  contactosAtendidos.add(userId);
  return true;
}

// ==========================================
// FUNCIÓN: OBTENER NOMBRE DEL USUARIO
// ==========================================
async function getNombreUsuario(userId) {
  try {
    const res = await axios.get(`https://graph.instagram.com/v21.0/${userId}`, {
      params: {
        fields: 'name,username',
        access_token: CONFIG.ACCESS_TOKEN
      }
    });
    return res.data.name || res.data.username || '';
  } catch (e) {
    return '';
  }
}

// ==========================================
// FUNCIÓN: RESPONDER COMENTARIO PÚBLICAMENTE
// ==========================================
async function responderComentario(commentId, nombre) {
  const mensaje = nombre
    ? `¡Hola ${nombre}! Te enviamos un mensaje privado 🤗`
    : `¡Hola! Te enviamos un mensaje privado 🤗`;
  try {
    await axios.post(
      `https://graph.instagram.com/v21.0/${commentId}/replies`,
      { message: mensaje, access_token: CONFIG.ACCESS_TOKEN }
    );
    console.log(`✅ Comentario respondido: ${mensaje}`);
  } catch (e) {
    console.error('❌ Error respondiendo comentario:', e.response?.data || e.message);
  }
}

// ==========================================
// FUNCIÓN: ENVIAR DM AL USUARIO
// ==========================================
async function enviarDM(userId, nombre) {
  const saludo = getSaludo();
  const nombreTexto = nombre ? `, ${nombre}` : '';
  const mensaje = `🤩 ¡Hola${nombreTexto}, muy ${saludo}! ¿Cómo estás?\n\nMi nombre es Brenda. Para poder asesorarte mejor, contame:\n\n✨ ¿Ya tenés alguna pieza Essen en casa?\n✨ ¿Conocés la marca?\n✨ ¿Qué piezas de la línea Rosa te interesan?`;
  try {
    await axios.post(
      `https://graph.instagram.com/v21.0/${CONFIG.IG_ACCOUNT_ID}/messages`,
      {
        recipient: { id: userId },
        message: { text: mensaje },
        access_token: CONFIG.ACCESS_TOKEN
      }
    );
    console.log(`✅ DM enviado a ${userId}`);
  } catch (e) {
    console.error('❌ Error enviando DM:', e.response?.data || e.message);
  }
}

// ==========================================
// FUNCIÓN: DETECTAR PALABRAS CLAVE
// ==========================================
function contieneKeyword(texto) {
  if (!texto) return false;
  const textoLower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return KEYWORDS.some(kw => textoLower.includes(kw));
}

// ==========================================
// WEBHOOK: VERIFICACIÓN DE META
// ==========================================
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

// ==========================================
// WEBHOOK: RECIBIR EVENTOS DE INSTAGRAM
// ==========================================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder rápido a Meta

  const body = req.body;
  if (body.object !== 'instagram') return;

  for (const entry of body.entry || []) {

    // --- ESCENARIO 1: Comentario en post ---
    for (const change of entry.changes || []) {
      if (change.field === 'comments') {
        const comentario = change.value;
        const texto = comentario.text || '';
        const userId = comentario.from?.id;
        const commentId = comentario.id;

        if (contieneKeyword(texto) && userId) {
          console.log(`💬 Comentario detectado de ${userId}: "${texto}"`);
          const nombre = await getNombreUsuario(userId);
          await responderComentario(commentId, nombre);
          await new Promise(r => setTimeout(r, 1500)); // pequeña pausa
          await enviarDM(userId, nombre);
        }
      }
    }

    // --- ESCENARIO 3: DM directo ---
    for (const messaging of entry.messaging || []) {
      const senderId = messaging.sender?.id;
      const texto = messaging.message?.text || '';

      // Ignorar mensajes enviados por nosotros mismos
      if (senderId === CONFIG.IG_ACCOUNT_ID) continue;

      if (esPrimerContacto(senderId)) {
        console.log(`📩 Primer DM de ${senderId}: "${texto}"`);
        const nombre = await getNombreUsuario(senderId);
        await enviarDM(senderId, nombre);
      }
    }
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
  res.send('🤖 EssenBot activo y funcionando!');
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 EssenBot corriendo en puerto ${PORT}`);
});
