const express = require('express');
const router = express.Router();
const { paginated, premiumMiddleware, resolveOwnerId, checkOwner } = require('./middleware');
const agentModule = require('../../agent');

// ===== Tasks =====
router.get('/tasks', premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset, ...filters } = req.query;
    filters.owner_id = req.userId;
    const queryLimit = Math.min(parseInt(limit) || 100, 500);
    const queryOffset = parseInt(offset) || 0;
    filters.limit = queryLimit + queryOffset;
    const tasks = await agentModule.listTasks(filters);
    res.json({ tasks: tasks.slice(queryOffset), total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', premiumMiddleware, async (req, res) => {
  try {
    const task = await agentModule.createTask({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tasks/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this task' });
    const task = await agentModule.updateTask(req.params.id, req.body);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this task' });
    await agentModule.deleteTask(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Calendar =====
router.get('/calendar', premiumMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const { limit, offset } = paginated(req, 500);
    const events = await agentModule.listCalendarEvents(filters);
    res.json({ events: events.slice(offset, offset + limit), total: events.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar', premiumMiddleware, async (req, res) => {
  try {
    const event = await agentModule.createCalendarEvent({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/calendar/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getCalendarEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this event' });
    const event = await agentModule.updateCalendarEvent(req.params.id, req.body);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendar/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getCalendarEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this event' });
    await agentModule.deleteCalendarEvent(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Contacts (CRM) =====
router.get('/contacts', premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req);
    const { limit: _l, offset: _o, ...filters } = req.query;
    filters.owner_id = req.userId;
    filters.limit = limit + offset;
    const contacts = await agentModule.listContacts(filters);
    res.json({ contacts: contacts.slice(offset), total: contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts', premiumMiddleware, async (req, res) => {
  try {
    const contact = await agentModule.createContact({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/contacts/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getContact(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this contact' });
    const contact = await agentModule.updateContact(req.params.id, req.body);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/contacts/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getContact(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this contact' });
    await agentModule.deleteContact(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Automations =====
router.get('/automations', premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req);
    const { limit: _l, offset: _o, ...filters } = req.query;
    filters.owner_id = req.userId;
    filters.limit = limit + offset;
    const automations = await agentModule.listAutomations(filters);
    res.json({ automations, total: automations.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/automations', premiumMiddleware, async (req, res) => {
  try {
    const auto = await agentModule.createAutomation({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/automations/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getAutomation(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this automation' });
    const auto = await agentModule.updateAutomation(req.params.id, req.body);
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/automations/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getAutomation(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this automation' });
    await agentModule.deleteAutomation(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
