const { pool } = require('../db');

async function createDriver(data) {
  const id = `drv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await pool.execute(
    'INSERT INTO delivery_drivers (id, persona_id, name, phone, vehicle_type, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.persona_id || null, data.name, data.phone, data.vehicle_type || 'motorcycle', JSON.stringify(data.metadata || {})]
  );
  return { id, ...data };
}

async function getDriver(id) {
  const [rows] = await pool.execute('SELECT * FROM delivery_drivers WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function listDrivers(personaId) {
  const [rows] = await pool.execute('SELECT * FROM delivery_drivers WHERE persona_id = ? OR persona_id IS NULL ORDER BY name ASC', [personaId]);
  return rows;
}

async function updateDriver(id, updates) {
  const allowed = ['name', 'phone', 'vehicle_type', 'is_active', 'current_lat', 'current_lng', 'metadata'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === 'metadata' ? JSON.stringify(value) : value);
    }
  }
  if (fields.length === 0) return { error: 'No valid fields' };
  values.push(id);
  await pool.execute(`UPDATE delivery_drivers SET ${fields.join(', ')} WHERE id = ?`, values);
  return { id, updated: true };
}

async function deleteDriver(id) {
  await pool.execute('DELETE FROM delivery_drivers WHERE id = ?', [id]);
  return { id, deleted: true };
}

async function assignDriver(orderId, driverId) {
  const id = `da_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await pool.execute(
    'INSERT INTO delivery_assignments (id, order_id, driver_id) VALUES (?, ?, ?)',
    [id, orderId, driverId]
  );
  await pool.execute("UPDATE orders SET status = 'preparing' WHERE id = ? AND status = 'confirmed'", [orderId]);
  return { id, order_id: orderId, driver_id: driverId, status: 'assigned' };
}

async function updateAssignment(orderId, status, notes) {
  const fields = ['status = ?'];
  const values = [status];
  if (status === 'picked_up') fields.push('picked_up_at = NOW()');
  if (status === 'delivered') fields.push('delivered_at = NOW()');
  if (notes) { fields.push('notes = ?'); values.push(notes); }
  values.push(orderId);
  await pool.execute(`UPDATE delivery_assignments SET ${fields.join(', ')} WHERE order_id = ?`, values);
  const orderStatusMap = { picked_up: 'shipped', delivered: 'delivered', failed: 'failed', cancelled: 'cancelled' };
  if (orderStatusMap[status]) {
    await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [orderStatusMap[status], orderId]);
  }
  return { order_id: orderId, status };
}

async function getDriverAssignments(driverId, status) {
  let query = 'SELECT da.*, o.total, o.customer_name FROM delivery_assignments da JOIN orders o ON da.order_id = o.id WHERE da.driver_id = ?';
  const params = [driverId];
  if (status) { query += ' AND da.status = ?'; params.push(status); }
  query += ' ORDER BY da.assigned_at DESC';
  const [rows] = await pool.execute(query, params);
  return rows;
}

async function getOrderAssignment(orderId) {
  const [rows] = await pool.execute(
    'SELECT da.*, d.name as driver_name, d.phone as driver_phone, d.vehicle_type FROM delivery_assignments da JOIN delivery_drivers d ON da.driver_id = d.id WHERE da.order_id = ?',
    [orderId]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  createDriver, getDriver, listDrivers, updateDriver, deleteDriver,
  assignDriver, updateAssignment, getDriverAssignments, getOrderAssignment,
};