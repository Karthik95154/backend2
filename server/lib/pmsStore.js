import { promises as fs } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { createDefaultZones } from '../data/seed.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const schemaPath = path.resolve(process.cwd(), 'server', 'db', 'schema.sql');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pms';

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const toAlphaCode = (index) => {
  let current = index;
  let code = '';

  do {
    code = String.fromCharCode(65 + (current % 26)) + code;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return code;
};

const extractPrefix = (slotNumber) => String(slotNumber || '').match(/^[A-Z]+/)?.[0] ?? '';
const extractNumericSuffix = (slotNumber) => Number(String(slotNumber || '').match(/(\d+)$/)?.[1] ?? 0);

const mapBusinessProfile = (row) => {
  if (!row) return null;

  return {
    legalBusinessName: row.legal_business_name,
    parkingName: row.parking_name,
    businessType: row.business_type,
    parkingLicenseNumber: row.parking_license_number,
    taxId: row.tax_id,
    area: row.area,
    fullAddress: row.full_address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    totalSlots: row.total_slots,
    floors: row.floors,
    vehicleTypes: Array.isArray(row.vehicle_types) ? row.vehicle_types : [],
    pricePerHour: Number(row.price_per_hour),
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    emergencyContact: row.emergency_contact,
    securityLead: row.security_lead,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    notes: row.notes,
  };
};

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, savedHash] = storedHash.split(':');
  const derivedHash = scryptSync(password, salt, 64);
  const savedHashBuffer = Buffer.from(savedHash, 'hex');

  if (savedHashBuffer.length !== derivedHash.length) {
    return false;
  }

  return timingSafeEqual(savedHashBuffer, derivedHash);
};

const mapSlot = (row) => ({
  id: row.id,
  zoneId: row.zone_id ?? undefined,
  number: row.number,
  status: row.status,
  vehicleNumber: row.vehicle_number ?? undefined,
  timeElapsed: row.time_elapsed ?? undefined,
  bookedBy: row.booked_by ?? undefined,
});

const mapZone = (row) => ({
  id: row.id,
  name: row.name,
  capacity: row.capacity,
  type: row.type,
  rate: Number(row.rate),
});

const mapBooking = (row) => ({
  id: row.id,
  user: row.user,
  vehicle: row.vehicle,
  time: row.time,
  status: row.status,
  assignedSlotId: row.assigned_slot_id ?? undefined,
  durationHours: Number(row.duration_hours ?? 1),
  amount: Number(row.amount ?? 0),
});

const mapPayment = (row) => ({
  id: row.id,
  bookingId: row.booking_id,
  amount: Number(row.amount),
  status: row.status,
  date: row.date,
});

const seedCollection = async (client, tableName, columns, rows) => {
  if (rows.length === 0) return;

  const valueGroups = [];
  const values = [];

  rows.forEach((row, rowIndex) => {
    const placeholders = columns.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    valueGroups.push(`(${placeholders.join(', ')})`);
    columns.forEach((column) => values.push(row[column]));
  });

  await client.query(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valueGroups.join(', ')} ON CONFLICT DO NOTHING`,
    values,
  );
};

const toSlotRows = (slots) =>
  slots.map((slot) => ({
    id: slot.id,
    zone_id: slot.zoneId,
    number: slot.number,
    status: slot.status,
    vehicle_number: slot.vehicleNumber ?? null,
    time_elapsed: slot.timeElapsed ?? null,
    booked_by: slot.bookedBy ?? null,
  }));

const insertSlots = async (client, slots) => {
  await seedCollection(
    client,
    'slots',
    ['id', 'zone_id', 'number', 'status', 'vehicle_number', 'time_elapsed', 'booked_by'],
    toSlotRows(slots),
  );
};

const buildSlotsForZones = (zones) =>
  zones.flatMap((zone, zoneIndex) => {
    const prefix = toAlphaCode(zoneIndex);

    return Array.from({ length: zone.capacity }).map((_, slotIndex) => ({
      id: `slot-${zone.id}-${slotIndex + 1}`,
      zoneId: zone.id,
      number: `${prefix}${slotIndex + 1}`,
      status: 'free',
      vehicleNumber: undefined,
      timeElapsed: undefined,
      bookedBy: undefined,
    }));
  });

const syncBusinessTotalSlots = async (client) => {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM slots');
  await client.query('UPDATE business_profile SET total_slots = $1, updated_at = NOW() WHERE id = 1', [rows[0]?.count ?? 0]);
};

const getNextPrefix = async (client) => {
  const { rows } = await client.query('SELECT number FROM slots');
  const usedPrefixes = new Set(rows.map((row) => extractPrefix(row.number)).filter(Boolean));
  let index = 0;

  while (usedPrefixes.has(toAlphaCode(index))) {
    index += 1;
  }

  return toAlphaCode(index);
};

const getZonePrefix = async (client, zoneId) => {
  const existing = await client.query('SELECT number FROM slots WHERE zone_id = $1 ORDER BY number LIMIT 1', [zoneId]);
  const prefix = extractPrefix(existing.rows[0]?.number);
  return prefix || getNextPrefix(client);
};

const createSlotsForZone = async (client, zoneId, count, startIndex = 1, prefix) =>
  Array.from({ length: count }).map((_, index) => ({
    id: `slot-${zoneId}-${startIndex + index}`,
    zoneId,
    number: `${prefix}${startIndex + index}`,
    status: 'free',
    vehicleNumber: undefined,
    timeElapsed: undefined,
    bookedBy: undefined,
  }));

const getSlotById = async (client, slotId) => {
  const result = await client.query('SELECT * FROM slots WHERE id = $1', [slotId]);
  return result.rows[0] ? mapSlot(result.rows[0]) : null;
};

const clearSlot = async (client, slotId) => {
  await client.query(
    `
      UPDATE slots
      SET status = 'free', vehicle_number = NULL, time_elapsed = NULL, booked_by = NULL
      WHERE id = $1
    `,
    [slotId],
  );
};

const reserveSlotForBooking = async (client, slotId, bookingId) => {
  const slot = await getSlotById(client, slotId);

  if (!slot) {
    throw new Error('Selected slot could not be found.');
  }

  if (slot.status !== 'free' && slot.bookedBy !== bookingId) {
    throw new Error(`Slot ${slot.number} is not available.`);
  }

  await client.query(
    `
      UPDATE slots
      SET status = 'reserved', vehicle_number = NULL, time_elapsed = NULL, booked_by = $2
      WHERE id = $1
    `,
    [slotId, bookingId],
  );
};

const occupySlotForBooking = async (client, slotId, bookingId, vehicleNumber, status = 'occupied', timeElapsed = '0h 00m') => {
  const slot = await getSlotById(client, slotId);

  if (!slot) {
    throw new Error('Selected slot could not be found.');
  }

  if (slot.status !== 'free' && slot.bookedBy !== bookingId && slot.status !== 'reserved') {
    throw new Error(`Slot ${slot.number} is not available.`);
  }

  await client.query(
    `
      UPDATE slots
      SET status = $2, vehicle_number = $3, time_elapsed = $4, booked_by = $5
      WHERE id = $1
    `,
    [slotId, status, vehicleNumber, timeElapsed, bookingId],
  );
};

const getFirstFreeSlotId = async (client) => {
  const result = await client.query("SELECT id FROM slots WHERE status = 'free' ORDER BY number LIMIT 1");
  return result.rows[0]?.id ?? null;
};

const getBusinessRate = async (client, slotId) => {
  if (slotId) {
    const zoneResult = await client.query(
      `
        SELECT z.rate
        FROM slots s
        JOIN parking_zones z ON z.id = s.zone_id
        WHERE s.id = $1
      `,
      [slotId],
    );

    if (zoneResult.rows[0]?.rate != null) {
      return Number(zoneResult.rows[0].rate);
    }
  }

  const profileResult = await client.query('SELECT price_per_hour FROM business_profile WHERE id = 1');
  return Number(profileResult.rows[0]?.price_per_hour ?? 0);
};

const getBookingAmount = async (client, slotId, durationHours) => {
  const rate = await getBusinessRate(client, slotId);
  return Number((rate * Math.max(1, durationHours)).toFixed(2));
};

const upsertPaymentForBooking = async (client, booking) => {
  const paymentDate = new Date().toISOString();
  const existing = await client.query('SELECT id FROM payments WHERE booking_id = $1 LIMIT 1', [booking.id]);

  if (existing.rows[0]?.id) {
    const { rows } = await client.query(
      `
        UPDATE payments
        SET amount = $2, status = 'Paid', date = $3
        WHERE booking_id = $1
        RETURNING *
      `,
      [booking.id, booking.amount, paymentDate],
    );

    return mapPayment(rows[0]);
  }

  const paymentId = `PAY-${Date.now()}`;
  const { rows } = await client.query(
    `
      INSERT INTO payments (id, booking_id, amount, status, date)
      VALUES ($1, $2, $3, 'Paid', $4)
      RETURNING *
    `,
    [paymentId, booking.id, booking.amount, paymentDate],
  );

  return mapPayment(rows[0]);
};

const getBookingRowById = async (client, bookingId) => {
  const result = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  return result.rows[0] ?? null;
};

const ensureOperationalData = async (client) => {
  const profileResult = await client.query('SELECT * FROM business_profile WHERE id = 1');
  const businessProfile = profileResult.rows[0];

  if (!businessProfile) {
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM parking_zones');
    await client.query('DELETE FROM slots');
    return;
  }

  let zoneRows = (await client.query('SELECT * FROM parking_zones ORDER BY id')).rows;

  if (zoneRows.length === 0) {
    const defaultZones = createDefaultZones(businessProfile.total_slots, Number(businessProfile.price_per_hour));
    await seedCollection(client, 'parking_zones', ['id', 'name', 'capacity', 'type', 'rate'], defaultZones);
    zoneRows = (await client.query('SELECT * FROM parking_zones ORDER BY id')).rows;
  }

  const slotAudit = await client.query('SELECT id, zone_id FROM slots ORDER BY number');
  const zoneCapacity = zoneRows.reduce((sum, zone) => sum + Number(zone.capacity), 0);
  const needsRepair =
    slotAudit.rows.length === 0 ||
    slotAudit.rows.length !== zoneCapacity ||
    slotAudit.rows.some((slot) => !slot.zone_id);

  if (needsRepair) {
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM slots');
    await insertSlots(client, buildSlotsForZones(zoneRows.map(mapZone)));
  }

  await syncBusinessTotalSlots(client);
};

let initPromise;

export const initializeStore = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      const schema = await fs.readFile(schemaPath, 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(schema);
        await ensureOperationalData(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    })();
  }

  return initPromise;
};

export const getBusinessProfile = async () => {
  const { rows } = await pool.query('SELECT * FROM business_profile WHERE id = 1');
  return mapBusinessProfile(rows[0]);
};

export const authenticateAdmin = async ({ email, password }) => {
  const { rows } = await pool.query('SELECT * FROM business_profile WHERE id = 1');
  const profile = rows[0];
  const normalizedEmail = normalizeEmail(email);

  if (!profile) {
    throw new Error('Register the parking business before signing in.');
  }

  if (normalizeEmail(profile.contact_email) !== normalizedEmail) {
    throw new Error('Invalid email or password.');
  }

  if (!verifyPassword(password, profile.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  return {
    name: profile.contact_person,
    role: 'owner',
    email: profile.contact_email,
  };
};

export const saveBusinessProfile = async (profile) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingProfileResult = await client.query('SELECT password_hash FROM business_profile WHERE id = 1');
    const existingPasswordHash = existingProfileResult.rows[0]?.password_hash ?? null;
    const nextPasswordHash = profile.adminPassword ? hashPassword(profile.adminPassword) : existingPasswordHash;

    if (!nextPasswordHash) {
      throw new Error('Admin password is required to register the parking business.');
    }

    await client.query(
      `
        INSERT INTO business_profile (
          id, legal_business_name, parking_name, business_type, parking_license_number, tax_id,
          area, full_address, city, state, postal_code, latitude, longitude, total_slots, floors, vehicle_types,
          price_per_hour, contact_person, contact_email, contact_phone, emergency_contact,
          security_lead, opening_time, closing_time, notes, password_hash, updated_at
        )
        VALUES (
          1, $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          legal_business_name = EXCLUDED.legal_business_name,
          parking_name = EXCLUDED.parking_name,
          business_type = EXCLUDED.business_type,
          parking_license_number = EXCLUDED.parking_license_number,
          tax_id = EXCLUDED.tax_id,
          area = EXCLUDED.area,
          full_address = EXCLUDED.full_address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_code = EXCLUDED.postal_code,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          total_slots = EXCLUDED.total_slots,
          floors = EXCLUDED.floors,
          vehicle_types = EXCLUDED.vehicle_types,
          price_per_hour = EXCLUDED.price_per_hour,
          contact_person = EXCLUDED.contact_person,
          contact_email = EXCLUDED.contact_email,
          contact_phone = EXCLUDED.contact_phone,
          emergency_contact = EXCLUDED.emergency_contact,
          security_lead = EXCLUDED.security_lead,
          opening_time = EXCLUDED.opening_time,
          closing_time = EXCLUDED.closing_time,
          notes = EXCLUDED.notes,
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
      `,
      [
        profile.legalBusinessName,
        profile.parkingName,
        profile.businessType,
        profile.parkingLicenseNumber,
        profile.taxId,
        profile.area,
        profile.fullAddress,
        profile.city,
        profile.state,
        profile.postalCode,
        profile.latitude ?? null,
        profile.longitude ?? null,
        profile.totalSlots,
        profile.floors,
        JSON.stringify(profile.vehicleTypes),
        profile.pricePerHour,
        profile.contactPerson,
        profile.contactEmail,
        profile.contactPhone,
        profile.emergencyContact,
        profile.securityLead,
        profile.openingTime,
        profile.closingTime,
        profile.notes,
        nextPasswordHash,
      ],
    );

    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM slots');
    await client.query('DELETE FROM parking_zones');

    const zones = createDefaultZones(profile.totalSlots, profile.pricePerHour);
    await seedCollection(client, 'parking_zones', ['id', 'name', 'capacity', 'type', 'rate'], zones);
    await insertSlots(client, buildSlotsForZones(zones));
    await syncBusinessTotalSlots(client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getBusinessProfile();
};

export const getSlots = async () => {
  const { rows } = await pool.query('SELECT * FROM slots ORDER BY number');
  return rows.map(mapSlot);
};

export const updateSlot = async (slotId, updates) => {
  const existing = await pool.query('SELECT * FROM slots WHERE id = $1', [slotId]);
  if (existing.rows.length === 0) return null;

  const next = { ...mapSlot(existing.rows[0]), ...updates };
  const { rows } = await pool.query(
    `
      UPDATE slots
      SET status = $2, vehicle_number = $3, time_elapsed = $4, booked_by = $5
      WHERE id = $1
      RETURNING *
    `,
    [slotId, next.status, next.vehicleNumber ?? null, next.timeElapsed ?? null, next.bookedBy ?? null],
  );

  return mapSlot(rows[0]);
};

export const getBookings = async () => {
  const { rows } = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC, time DESC');
  return rows.map(mapBooking);
};

export const createBooking = async (payload) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (!payload.user || !payload.vehicle || !payload.time) {
      throw new Error('User name, vehicle number, and booking time are required.');
    }

    const bookingId = `B-${Date.now()}`;
    const durationHours = Math.max(1, Number(payload.durationHours || 1));
    let assignedSlotId = payload.assignedSlotId || null;
    let status = assignedSlotId ? 'assigned' : 'booked';

    if (assignedSlotId) {
      await reserveSlotForBooking(client, assignedSlotId, bookingId);
    }

    const amount = await getBookingAmount(client, assignedSlotId, durationHours);
    const { rows } = await client.query(
      `
        INSERT INTO bookings (id, "user", vehicle, time, status, assigned_slot_id, duration_hours, amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [bookingId, payload.user, payload.vehicle, payload.time, status, assignedSlotId, durationHours, amount],
    );

    await client.query('COMMIT');
    return mapBooking(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateBooking = async (bookingId, updates) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingRow = await getBookingRowById(client, bookingId);
    if (!existingRow) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = mapBooking(existingRow);
    const nextStatus = updates.status ?? current.status;
    let assignedSlotId = updates.assignedSlotId ?? current.assignedSlotId ?? null;
    const durationHours = Math.max(1, Number(updates.durationHours ?? current.durationHours ?? 1));
    const user = updates.user ?? current.user;
    const vehicle = updates.vehicle ?? current.vehicle;
    const time = updates.time ?? current.time;

    if (nextStatus === 'booked' && current.assignedSlotId) {
      await clearSlot(client, current.assignedSlotId);
      assignedSlotId = null;
    }

    if (nextStatus === 'assigned') {
      if (!assignedSlotId) {
        assignedSlotId = await getFirstFreeSlotId(client);
      }

      if (!assignedSlotId) {
        throw new Error('No free slot is available for assignment.');
      }

      if (current.assignedSlotId && current.assignedSlotId !== assignedSlotId) {
        await clearSlot(client, current.assignedSlotId);
      }

      await reserveSlotForBooking(client, assignedSlotId, bookingId);
    }

    if (nextStatus === 'active') {
      if (!assignedSlotId) {
        assignedSlotId = current.assignedSlotId ?? (await getFirstFreeSlotId(client));
      }

      if (!assignedSlotId) {
        throw new Error('No free slot is available to start parking.');
      }

      if (current.assignedSlotId && current.assignedSlotId !== assignedSlotId) {
        await clearSlot(client, current.assignedSlotId);
      }

      await occupySlotForBooking(client, assignedSlotId, bookingId, vehicle, 'occupied', '0h 00m');
    }

    if (nextStatus === 'overstay') {
      if (!assignedSlotId) {
        assignedSlotId = current.assignedSlotId ?? (await getFirstFreeSlotId(client));
      }

      if (!assignedSlotId) {
        throw new Error('No slot is linked to this overstay booking.');
      }

      await occupySlotForBooking(client, assignedSlotId, bookingId, vehicle, 'overstay', `${durationHours + 1}h 15m`);
    }

    if (nextStatus === 'cancelled' || nextStatus === 'completed') {
      if (current.assignedSlotId) {
        await clearSlot(client, current.assignedSlotId);
      }
    }

    const amount = await getBookingAmount(client, assignedSlotId ?? current.assignedSlotId ?? null, durationHours);
    const { rows } = await client.query(
      `
        UPDATE bookings
        SET "user" = $2,
            vehicle = $3,
            time = $4,
            status = $5,
            assigned_slot_id = $6,
            duration_hours = $7,
            amount = $8
        WHERE id = $1
        RETURNING *
      `,
      [bookingId, user, vehicle, time, nextStatus, assignedSlotId, durationHours, amount],
    );

    const booking = mapBooking(rows[0]);

    if (booking.status === 'completed') {
      await upsertPaymentForBooking(client, booking);
    }

    await client.query('COMMIT');
    return booking;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getPayments = async () => {
  const { rows } = await pool.query('SELECT * FROM payments ORDER BY date DESC, id DESC');
  return rows.map(mapPayment);
};

export const getParkingZones = async () => {
  const { rows } = await pool.query('SELECT * FROM parking_zones ORDER BY name');
  return rows.map(mapZone);
};

export const createParkingZone = async (zone) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const zoneId = `zone-${Date.now()}`;
    const capacity = Math.max(1, Number(zone.capacity || 1));
    const { rows } = await client.query(
      `
        INSERT INTO parking_zones (id, name, capacity, type, rate)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [zoneId, zone.name, capacity, zone.type, zone.rate],
    );

    const prefix = await getNextPrefix(client);
    const slots = await createSlotsForZone(client, zoneId, capacity, 1, prefix);
    await insertSlots(client, slots);
    await syncBusinessTotalSlots(client);

    await client.query('COMMIT');
    return mapZone(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateParkingZone = async (zoneId, updates) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT * FROM parking_zones WHERE id = $1', [zoneId]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = mapZone(existing.rows[0]);
    const next = { ...current, ...updates, capacity: Math.max(1, Number(updates.capacity ?? current.capacity)) };

    await client.query(
      `
        UPDATE parking_zones
        SET name = $2, capacity = $3, type = $4, rate = $5
        WHERE id = $1
      `,
      [zoneId, next.name, next.capacity, next.type, next.rate],
    );

    if (next.capacity > current.capacity) {
      const prefix = await getZonePrefix(client, zoneId);
      const slots = await createSlotsForZone(client, zoneId, next.capacity - current.capacity, current.capacity + 1, prefix);
      await insertSlots(client, slots);
    }

    if (next.capacity < current.capacity) {
      const removableCount = current.capacity - next.capacity;
      const freeSlotsResult = await client.query(
        "SELECT id, number FROM slots WHERE zone_id = $1 AND status = 'free'",
        [zoneId],
      );

      const removableSlots = freeSlotsResult.rows
        .sort((a, b) => extractNumericSuffix(b.number) - extractNumericSuffix(a.number))
        .slice(0, removableCount);

      if (removableSlots.length < removableCount) {
        throw new Error('Reduce occupied or reserved slots before decreasing this zone capacity.');
      }

      await client.query('DELETE FROM slots WHERE id = ANY($1::text[])', [removableSlots.map((slot) => slot.id)]);
    }

    await syncBusinessTotalSlots(client);

    const { rows } = await client.query('SELECT * FROM parking_zones WHERE id = $1', [zoneId]);
    await client.query('COMMIT');
    return mapZone(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteParkingZone = async (zoneId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const slotAudit = await client.query("SELECT id FROM slots WHERE zone_id = $1 AND status <> 'free'", [zoneId]);
    if (slotAudit.rows.length > 0) {
      throw new Error('Clear active vehicles from this zone before deleting it.');
    }

    await client.query('DELETE FROM slots WHERE zone_id = $1', [zoneId]);
    const result = await client.query('DELETE FROM parking_zones WHERE id = $1', [zoneId]);
    await syncBusinessTotalSlots(client);

    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getDashboardStats = async () => {
  const [slotStats, paymentStats, zoneStats, bookingStats] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_slots,
        COUNT(*) FILTER (WHERE status IN ('occupied', 'overstay'))::int AS occupied_count,
        COUNT(*) FILTER (WHERE status = 'free')::int AS available_count,
        COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved_count,
        COUNT(*) FILTER (WHERE status = 'overstay')::int AS overstay_count
      FROM slots
    `),
    pool.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Paid'), 0)::numeric AS revenue
      FROM payments
    `),
    pool.query('SELECT COUNT(*)::int AS zone_count FROM parking_zones'),
    pool.query("SELECT COUNT(*)::int AS active_bookings FROM bookings WHERE status IN ('assigned', 'active', 'overstay')"),
  ]);

  return {
    totalSlots: slotStats.rows[0]?.total_slots ?? 0,
    occupiedCount: slotStats.rows[0]?.occupied_count ?? 0,
    availableCount: slotStats.rows[0]?.available_count ?? 0,
    reservedCount: slotStats.rows[0]?.reserved_count ?? 0,
    overstayCount: slotStats.rows[0]?.overstay_count ?? 0,
    revenue: Number(paymentStats.rows[0]?.revenue ?? 0),
    zoneCount: zoneStats.rows[0]?.zone_count ?? 0,
    activeBookings: bookingStats.rows[0]?.active_bookings ?? 0,
  };
};

export const closeStore = async () => {
  await pool.end();
};
