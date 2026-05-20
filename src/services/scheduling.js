const { pool } = require('../db');

class SchedulingService {
  constructor() {
    this.cache = new Map();
  }

  async getWorkingHours(personaId, dayOfWeek) {
    const cacheKey = `${personaId}:${dayOfWeek}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    
    const [rows] = await pool.execute(
      `SELECT * FROM scheduling_working_hours WHERE persona_id = ? AND day_of_week = ? AND is_active = 1`,
      [personaId, dayOfWeek]
    );
    this.cache.set(cacheKey, rows);
    return rows;
  }

  async getAppointments(personaId, date) {
    const [rows] = await pool.execute(
      `SELECT * FROM scheduling_appointments 
       WHERE persona_id = ? AND DATE(start_time) = ? AND status NOT IN ('cancelled', 'no_show')`,
      [personaId, date]
    );
    return rows;
  }

  async getDailyLimit(personaId) {
    const [rows] = await pool.execute(
      `SELECT max_daily_appointments, slot_duration_minutes, buffer_minutes, capacity_per_slot 
       FROM scheduling_settings WHERE persona_id = ?`,
      [personaId]
    );
    return rows[0] || { max_daily_appointments: 50, slot_duration_minutes: 30, buffer_minutes: 10, capacity_per_slot: 1 };
  }

  async availableSlots(personaId, serviceTypeId, date) {
    const [hours, appointments, settings, serviceType] = await Promise.all([
      this.getWorkingHours(personaId, new Date(date).getDay()),
      this.getAppointments(personaId, date),
      this.getDailyLimit(personaId),
      this.getServiceType(serviceTypeId),
    ]);

    if (!hours.length) return [];
    if (!settings) return [];

    const duration = serviceType?.duration_minutes || settings.slot_duration_minutes || 30;
    const buffer = settings.buffer_minutes || 10;
    const slotDuration = duration + buffer;
    const capacity = settings.capacity_per_slot || 1;
    const dailyLimit = settings.max_daily_appointments || 50;

    const dateObj = new Date(date);
    const slots = [];
    const now = new Date();
    const isToday = dateObj.toDateString() === now.toDateString();

    for (const hour of hours) {
      let cursor = this.parseTime(date, hour.start_time);
      const finish = this.parseTime(date, hour.end_time);

      const dayAppointments = appointments.filter(a => {
        const start = new Date(a.start_time);
        return start >= hour.start_time && start < hour.end_time;
      });

      if (dayAppointments.length >= dailyLimit) continue;

      while (cursor.addMinutes(duration).lte(finish)) {
        const slotEnd = new Date(cursor.getTime() + duration * 60000);

        if (!isToday || slotEnd > now) {
          const hasCapacity = dayAppointments.filter(a => {
            const aStart = new Date(a.start_time).getTime();
            const aEnd = new Date(a.end_time).getTime();
            const slotStart = cursor.getTime();
            const slotEndMs = slotEnd.getTime();
            return !(aEnd <= slotStart || aStart >= slotEndMs);
          }).length < capacity;

          if (hasCapacity) {
            slots.push({
              starts_at: cursor.toISOString(),
              ends_at: slotEnd.toISOString(),
              label: cursor.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              capacity,
              available: capacity - dayAppointments.filter(a => {
                const aStart = new Date(a.start_time).getTime();
                return Math.abs(aStart - cursor.getTime()) < 60000;
              }).length,
            });
          }
        }

        cursor = new Date(cursor.getTime() + slotDuration * 60000);
      }
    }

    return slots;
  }

  async bookSlot(personaId, serviceTypeId, startTime, customerData, options = {}) {
    const { customerName, customerPhone, customerEmail, notes, ownerId } = customerData;
    
    const slots = await this.availableSlots(personaId, serviceTypeId, startTime.split('T')[0]);
    const slot = slots.find(s => s.starts_at === startTime);
    if (!slot) throw new Error('Horário não disponível para agendamento');

    const [service] = await pool.execute(
      `SELECT duration_minutes FROM scheduling_service_types WHERE id = ?`,
      [serviceTypeId]
    );
    const duration = service[0]?.duration_minutes || 30;
    const endTime = new Date(new Date(startTime).getTime() + duration * 60000).toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await pool.execute(
      `INSERT INTO scheduling_appointments 
       (persona_id, service_type_id, start_time, end_time, customer_name, customer_phone, customer_email, notes, status, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, NOW())`,
      [personaId, serviceTypeId, startTime, endTime, customerName, customerPhone, customerEmail, notes || '', ownerId || personaId]
    );

    return this.getAppointment(result.insertId);
  }

  async cancelAppointment(appointmentId, reason = '') {
    await pool.execute(
      `UPDATE scheduling_appointments SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), ' | Cancelado: ', ?) WHERE id = ?`,
      [reason, appointmentId]
    );
    return this.getAppointment(appointmentId);
  }

  async getAppointment(appointmentId) {
    const [rows] = await pool.execute(
      `SELECT a.*, st.name as service_name, st.duration_minutes 
       FROM scheduling_appointments a
       LEFT JOIN scheduling_service_types st ON st.id = a.service_type_id
       WHERE a.id = ?`,
      [appointmentId]
    );
    return rows[0];
  }

  async listAppointments(personaId, filters = {}) {
    let where = 'WHERE a.persona_id = ?';
    const params = [personaId];

    if (filters.status) {
      where += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters.date_from) {
      where += ' AND a.start_time >= ?';
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where += ' AND a.start_time <= ?';
      params.push(filters.date_to);
    }
    if (filters.customer_phone) {
      where += ' AND a.customer_phone LIKE ?';
      params.push(`%${filters.customer_phone}%`);
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const [rows] = await pool.execute(
      `SELECT a.*, st.name as service_name 
       FROM scheduling_appointments a
       LEFT JOIN scheduling_service_types st ON st.id = a.service_type_id
       ${where}
       ORDER BY a.start_time DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );
    return rows;
  }

  async getServiceTypes(personaId) {
    const [rows] = await pool.execute(
      `SELECT * FROM scheduling_service_types WHERE persona_id = ? AND is_active = 1`,
      [personaId]
    );
    return rows;
  }

  async createServiceType(data) {
    const { personaId, name, description, durationMinutes, price, bufferMinutes = 10, capacityPerSlot = 1 } = data;
    const [result] = await pool.execute(
      `INSERT INTO scheduling_service_types (persona_id, name, description, duration_minutes, price, buffer_minutes, capacity_per_slot, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [personaId, name, description || '', durationMinutes, price || 0, bufferMinutes, capacityPerSlot]
    );
    return { id: result.insertId, ...data };
  }

  async getStats(personaId, dateFrom, dateTo) {
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM scheduling_appointments WHERE persona_id = ? AND status NOT IN ('cancelled') AND created_at >= ? AND created_at <= ?`,
      [personaId, dateFrom, dateTo]
    );
    const [confirmed] = await pool.execute(
      `SELECT COUNT(*) as confirmed FROM scheduling_appointments WHERE persona_id = ? AND status = 'confirmed' AND created_at >= ? AND created_at <= ?`,
      [personaId, dateFrom, dateTo]
    );
    const [cancelled] = await pool.execute(
      `SELECT COUNT(*) as cancelled FROM scheduling_appointments WHERE persona_id = ? AND status = 'cancelled' AND created_at >= ? AND created_at <= ?`,
      [personaId, dateFrom, dateTo]
    );
    return { total: total[0]?.total || 0, confirmed: confirmed[0]?.confirmed || 0, cancelled: cancelled[0]?.cancelled || 0 };
  }

  parseTime(dateStr, timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateStr);
    d.setHours(h, m, 0, 0);
    return d;
  }

  async getServiceType(serviceTypeId) {
    const [rows] = await pool.execute(
      `SELECT * FROM scheduling_service_types WHERE id = ?`,
      [serviceTypeId]
    );
    return rows[0];
  }
}

const scheduling = new SchedulingService();

module.exports = scheduling;