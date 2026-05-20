const { pool } = require('../db');

async function getRevenueReport(personaId, startDate, endDate) {
  const params = [personaId];
  let dateFilter = '';
  if (startDate && endDate) {
    dateFilter = ' AND o.created_at BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    dateFilter = ' AND o.created_at >= ?';
    params.push(startDate);
  }
  const [revenue] = await pool.execute(
    `SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) as gross_revenue,
            COALESCE(SUM(CASE WHEN oi.type = 'refund' THEN oi.quantity * oi.unit_price ELSE 0 END), 0) as refunds,
            COUNT(DISTINCT o.id) as total_orders,
            COUNT(DISTINCT o.customer_id) as unique_customers
     FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     WHERE o.persona_id = ? AND o.status NOT IN ('cancelled')${dateFilter}`,
    params
  );
  const r = revenue[0];
  return {
    gross_revenue: parseFloat(r.gross_revenue) || 0,
    refunds: parseFloat(r.refunds) || 0,
    net_revenue: (parseFloat(r.gross_revenue) || 0) - (parseFloat(r.refunds) || 0),
    total_orders: r.total_orders,
    unique_customers: r.unique_customers,
    average_ticket: r.total_orders > 0 ? parseFloat((r.gross_revenue / r.total_orders).toFixed(2)) : 0,
    period: { start: startDate, end: endDate },
  };
}

async function getOrdersByStatus(personaId, startDate, endDate) {
  const params = [personaId];
  let dateFilter = '';
  if (startDate && endDate) { dateFilter = ' AND created_at BETWEEN ? AND ?'; params.push(startDate, endDate); }
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE persona_id = ?${dateFilter} GROUP BY status ORDER BY count DESC`,
    params
  );
  const result = {};
  for (const r of rows) result[r.status] = { count: r.count, total: parseFloat(r.total) };
  return result;
}

async function getTopProducts(personaId, limit = 10, startDate, endDate) {
  const params = [personaId];
  let dateFilter = '';
  if (startDate && endDate) { dateFilter = ' AND o.created_at BETWEEN ? AND ?'; params.push(startDate, endDate); }
  const lim = Math.max(parseInt(limit) || 10, 1);
  const [rows] = await pool.execute(
    `SELECT oi.product_id, oi.title, SUM(oi.quantity) as qty, SUM(oi.quantity * oi.unit_price) as revenue
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.persona_id = ? AND o.status NOT IN ('cancelled')${dateFilter}
     GROUP BY oi.product_id, oi.title ORDER BY qty DESC LIMIT ${lim}`,
    params
  );
  return rows.map(r => ({ product_id: r.product_id, title: r.title, qty: r.qty, revenue: parseFloat(r.revenue) }));
}

async function getSalesTrend(personaId, days = 30) {
  const d = Math.max(parseInt(days) || 30, 1);
  const [rows] = await pool.execute(
    `SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue
     FROM orders WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ${d} DAY) AND status NOT IN ('cancelled')
     GROUP BY DATE(created_at) ORDER BY date ASC`,
    [personaId]
  );
  return rows.map(r => ({ date: r.date, orders: r.orders, revenue: parseFloat(r.revenue) }));
}

async function getCustomerMetrics(personaId) {
  const [newCustomers] = await pool.execute(
    'SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
  );
  const [retention] = await pool.execute(
    `SELECT COUNT(DISTINCT user_id) as recurring FROM persona_messages WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND user_id IN (
       SELECT DISTINCT user_id FROM persona_messages WHERE persona_id = ? AND created_at BETWEEN DATE_SUB(NOW(), INTERVAL 60 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
    )`,
    [personaId, personaId]
  );
  const [avgMessages] = await pool.execute(
    'SELECT AVG(msg_count) as avg FROM (SELECT user_id, COUNT(*) as msg_count FROM persona_messages WHERE persona_id = ? GROUP BY user_id) sub',
    [personaId]
  );
  return {
    new_customers_30d: newCustomers[0].count || 0,
    recurring_customers: retention[0].recurring || 0,
    avg_messages_per_user: parseFloat(avgMessages[0].avg).toFixed(1) || 0,
  };
}

async function getConversionFunnel(personaId) {
  const [conversations] = await pool.execute('SELECT COUNT(DISTINCT session_id) as count FROM persona_messages WHERE persona_id = ?', [personaId]);
  const [carts] = await pool.execute("SELECT COUNT(*) as count FROM commerce_carts WHERE flow_step NOT IN ('browsing') AND persona_id = ?", [personaId || 'default']);
  const [orders] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE persona_id = ? AND status NOT IN ('cancelled')", [personaId]);
  const [completed] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE persona_id = ? AND status IN ('delivered', 'completed')", [personaId]);
  return {
    conversations: conversations[0].count || 0,
    carts_started: carts[0].count || 0,
    orders_placed: orders[0].count || 0,
    orders_completed: completed[0].count || 0,
    cart_to_order: orders[0].count > 0 ? ((orders[0].count / Math.max(carts[0].count, 1)) * 100).toFixed(1) + '%' : '0%',
    order_to_delivery: completed[0].count > 0 ? ((completed[0].count / Math.max(orders[0].count, 1)) * 100).toFixed(1) + '%' : '0%',
  };
}

async function getFullDashboard(personaId, startDate, endDate) {
  const [revenue, ordersByStatus, topProducts, salesTrend, customers, funnel] = await Promise.all([
    getRevenueReport(personaId, startDate, endDate),
    getOrdersByStatus(personaId, startDate, endDate),
    getTopProducts(personaId, 10, startDate, endDate),
    getSalesTrend(personaId, 30),
    getCustomerMetrics(personaId),
    getConversionFunnel(personaId),
  ]);
  return { revenue, orders_by_status: ordersByStatus, top_products: topProducts, sales_trend: salesTrend, customers, conversion_funnel: funnel };
}

module.exports = {
  getRevenueReport, getOrdersByStatus, getTopProducts,
  getSalesTrend, getCustomerMetrics, getConversionFunnel, getFullDashboard,
};