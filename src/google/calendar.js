const { google } = require('googleapis');
const logger = require('../logger').child({ module: 'google-calendar' });
const { pool } = require('../db');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

function getOAuth2Client(userId) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const redirectUrl = `${process.env.SERVER_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
  return { oauth2Client, redirectUrl };
}

async function getUserTokens(userId) {
  const [rows] = await pool.execute(
    'SELECT google_access_token, google_refresh_token, google_token_expiry, google_calendar_sync FROM users WHERE id = ?',
    [userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function saveUserTokens(userId, tokens) {
  await pool.execute(
    `INSERT INTO user_google_tokens (user_id, access_token, refresh_token, token_expiry, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), refresh_token = VALUES(refresh_token),
     token_expiry = VALUES(token_expiry), scope = VALUES(scope), updated_at = NOW()`,
    [userId, tokens.access_token, tokens.refresh_token || '', tokens.expiry_date ? new Date(tokens.expiry_date) : null, tokens.scope || '']
  );
}

async function getAuthenticatedClient(userId) {
  const tokenData = await getUserTokens(userId);
  if (!tokenData || !tokenData.google_access_token) return null;

  const clientConfig = getOAuth2Client(userId);
  if (!clientConfig) return null;
  const { oauth2Client } = clientConfig;

  oauth2Client.setCredentials({
    access_token: tokenData.google_access_token,
    refresh_token: tokenData.google_refresh_token,
    expiry_date: tokenData.google_token_expiry ? new Date(tokenData.google_token_expiry).getTime() : null,
  });

  oauth2Client.on('tokens', async (tokens) => {
    await saveUserTokens(userId, tokens);
  });

  return oauth2Client;
}

async function getAuthUrl(userId) {
  const clientConfig = getOAuth2Client(userId);
  if (!clientConfig) throw new Error('Google OAuth not configured');

  const { oauth2Client, redirectUrl } = clientConfig;
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });

  return url;
}

async function handleCallback(code) {
  const clientConfig = getOAuth2Client('callback');
  if (!clientConfig) throw new Error('Google OAuth not configured');
  const { oauth2Client } = clientConfig;

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let userId = null;
  try {
    const state = JSON.parse(Buffer.from(tokens.scope || '', 'base64').toString());
    userId = state.userId;
  } catch {}

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  return { tokens, userId: userId || payload.sub, email: payload.email, name: payload.name };
}

async function listCalendars(userId) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list({ minAccessRole: 'reader' });
  return res.data.items.map(cal => ({
    id: cal.id,
    name: cal.summary,
    primary: cal.primary || false,
    timeZone: cal.timeZone,
  }));
}

async function listEvents(userId, calendarId = 'primary', options = {}) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  const params = {
    calendarId,
    maxResults: options.maxResults || 50,
    singleEvents: true,
    orderBy: 'startTime',
  };

  if (options.timeMin) params.timeMin = options.timeMin;
  if (options.timeMax) params.timeMax = options.timeMax;
  if (options.q) params.q = options.q;

  const res = await calendar.events.list(params);
  return res.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    description: event.description || '',
    location: event.location || '',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    status: event.status,
    attendees: (event.attendees || []).map(a => ({ email: a.email, name: a.displayName, response: a.responseStatus })),
  }));
}

async function createEvent(userId, event, calendarId = 'primary') {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  const resource = {
    summary: event.summary,
    description: event.description || '',
    location: event.location || '',
    start: event.allDay ? { date: event.start } : { dateTime: event.start, timeZone: event.timeZone || 'America/Sao_Paulo' },
    end: event.allDay ? { date: event.end } : { dateTime: event.end, timeZone: event.timeZone || 'America/Sao_Paulo' },
    reminders: event.reminders !== false ? { useDefault: true } : { overrides: [] },
  };

  if (event.attendees && event.attendees.length > 0) {
    resource.attendees = event.attendees.map(a => ({ email: a.email, displayName: a.name }));
  }

  const res = await calendar.events.insert({ calendarId, resource, sendUpdates: event.sendUpdates || 'all' });
  return {
    id: res.data.id,
    htmlLink: res.data.htmlLink,
    summary: res.data.summary,
    start: res.data.start?.dateTime || res.data.start?.date,
    end: res.data.end?.dateTime || res.data.end?.date,
  };
}

async function updateEvent(userId, eventId, updates, calendarId = 'primary') {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  const resource = {};
  if (updates.summary) resource.summary = updates.summary;
  if (updates.description !== undefined) resource.description = updates.description;
  if (updates.location !== undefined) resource.location = updates.location;
  if (updates.start) resource.start = updates.allDay ? { date: updates.start } : { dateTime: updates.start, timeZone: updates.timeZone || 'America/Sao_Paulo' };
  if (updates.end) resource.end = updates.allDay ? { date: updates.end } : { dateTime: updates.end, timeZone: updates.timeZone || 'America/Sao_Paulo' };

  const res = await calendar.events.update({ calendarId, eventId, resource });
  return { id: res.data.id, summary: res.data.summary, start: res.data.start?.dateTime, end: res.data.end?.dateTime };
}

async function deleteEvent(userId, eventId, calendarId = 'primary') {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' });
  return { deleted: true, eventId };
}

async function checkFreeBusy(userId, timeMin, timeMax, calendarId = 'primary') {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy || [];
  return busy.map(slot => ({ start: slot.start, end: slot.end }));
}

async function syncAppointmentToGoogle(userId, appointment) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) return null;

  const event = {
    summary: appointment.service_name || appointment.title || 'Agendamento',
    description: appointment.notes || '',
    location: appointment.location || '',
    start: appointment.start_time,
    end: appointment.end_time,
    attendees: [],
  };

  if (appointment.customer_email) event.attendees.push({ email: appointment.customer_email, name: appointment.customer_name });
  if (appointment.customer_phone) event.description += `\nTelefone: ${appointment.customer_phone}`;

  try {
    const result = await createEvent(userId, event);
    await pool.execute(
      'UPDATE scheduling_appointments SET google_event_id = ? WHERE id = ?',
      [result.id, appointment.id]
    );
    return result;
  } catch (err) {
    logger.error('Failed to sync appointment to Google Calendar', { error: err.message, appointmentId: appointment.id });
    return null;
  }
}

async function disconnectGoogleCalendar(userId) {
  await pool.execute('DELETE FROM user_google_tokens WHERE user_id = ?', [userId]);
  await pool.execute('UPDATE users SET google_calendar_sync = 0 WHERE id = ?', [userId]);
}

async function isGoogleCalendarConnected(userId) {
  const tokenData = await getUserTokens(userId);
  return !!(tokenData && tokenData.google_access_token);
}

module.exports = {
  getOAuth2Client,
  getAuthUrl,
  handleCallback,
  saveUserTokens,
  getAuthenticatedClient,
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  checkFreeBusy,
  syncAppointmentToGoogle,
  disconnectGoogleCalendar,
  isGoogleCalendarConnected,
  SCOPES,
};