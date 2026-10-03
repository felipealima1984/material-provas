// ============================================================
// Integração com o Google Calendar via Google Identity Services (GIS) —
// o fluxo OAuth de um site comum (diferente do chrome.identity que o
// Mirante usa, exclusivo de extensão Chrome). Sem backend: o token de
// acesso vive só em memória desta aba (nunca em localStorage), pedido
// de novo a cada sessão/expiração via GIS. Requer:
//   1) <script src="https://accounts.google.com/gsi/client"> carregado
//      antes de chamar qualquer função daqui;
//   2) configure(clientId) chamado uma vez, com um Client ID OAuth do
//      tipo "Aplicativo da Web" (não "App Chrome") do Google Cloud
//      Console, com a origem do site nas "Origens JavaScript
//      autorizadas".
// Portado de js/googleCalendar.js do Mirante — mesma forma de montar o
// corpo do evento e de criar/excluir, só a obtenção do token muda.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GoogleCalendar = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const CONNECTED_KEY = 'mp_googleCalendarConnected';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

  let CLIENT_ID = '';
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function configure(clientId) {
    CLIENT_ID = clientId || '';
    tokenClient = null; // força recriar se o client id mudar
  }

  function hasGis() {
    return typeof window !== 'undefined' && !!window.google && !!window.google.accounts && !!window.google.accounts.oauth2;
  }
  function isAvailable() {
    return hasGis() && !!CLIENT_ID;
  }
  function isConnected() {
    try { return isAvailable() && localStorage.getItem(CONNECTED_KEY) === '1'; } catch (e) { return false; }
  }
  function setConnectedFlag(value) {
    try { if (value) localStorage.setItem(CONNECTED_KEY, '1'); else localStorage.removeItem(CONNECTED_KEY); } catch (e) {}
  }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // sobrescrito por chamada em getToken()
    });
    return tokenClient;
  }

  /** Pede um token — silencioso (prompt vazio) ou interativo (abre popup de consentimento, exige gesto do usuário). */
  function getToken({ interactive }) {
    return new Promise((resolve, reject) => {
      if (!isAvailable()) {
        reject(new Error('Google Identity Services indisponível ou Client ID não configurado.'));
        return;
      }
      if (accessToken && Date.now() < tokenExpiresAt - 30000) { resolve(accessToken); return; }
      const tc = ensureTokenClient();
      tc.callback = (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
          resolve(accessToken);
        } else {
          reject(new Error((resp && (resp.error_description || resp.error)) || 'Não foi possível obter o token do Google.'));
        }
      };
      tc.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  /** Abre o popup de login/consentimento do Google (gesto do usuário obrigatório). */
  async function connect() {
    await getToken({ interactive: true });
    setConnectedFlag(true);
  }

  function disconnect() {
    setConnectedFlag(false);
    if (accessToken && hasGis() && window.google.accounts.oauth2.revoke) {
      try { window.google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  function eventsUrl(calendarId) {
    return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  }
  function nextDayKey(dateKey) {
    const d = new Date(dateKey + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  function buildEventBody(dateKey, { summary, description }) {
    return {
      summary,
      description: description || undefined,
      start: { date: dateKey },
      end: { date: nextDayKey(dateKey) },
      // Lembrete explícito (popup + e-mail) às 9h do dia, em vez de herdar
      // o padrão da agenda — chega por e-mail e notificação push mesmo
      // que a agenda de destino não tenha lembrete nenhum configurado.
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 540 }, { method: 'email', minutes: 540 }] },
    };
  }

  /** Cria um evento de dia inteiro em `dateKey` ("YYYY-MM-DD"). Retorna o evento criado (tem `.id`). */
  async function createEvent(dateKey, opts, calendarId) {
    calendarId = calendarId || 'primary';
    const token = await getToken({ interactive: false });
    const res = await fetch(eventsUrl(calendarId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEventBody(dateKey, opts)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Google Calendar respondeu ${res.status} ao criar evento. ${detail}`);
    }
    return res.json();
  }

  /** Exclui um evento. 410 (já não existia) é tratado como sucesso. */
  async function deleteEvent(eventId, calendarId) {
    calendarId = calendarId || 'primary';
    const token = await getToken({ interactive: false });
    const res = await fetch(`${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 410) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Google Calendar respondeu ${res.status} ao excluir evento. ${detail}`);
    }
  }

  return { configure, isAvailable, isConnected, connect, disconnect, createEvent, deleteEvent, nextDayKey };
});
