import { promises as fs } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { createDefaultZones, createInitialSlots } from '../data/seed.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const schemaPath = path.resolve(process.cwd(), 'server', 'db', 'schema.sql');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Karthik@localhost:5432/pms';

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

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
    columns.forEach((column) => {
      values.push(row[column]);
    });
  });

  await client.query(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valueGroups.join(', ')} ON CONFLICT DO NOTHING`,
    values,
  );
};

const ensureOperationalData = async (client) => {
  const { rows } = await client.query('SELECT * FROM business_profile WHERE id = 1');
  const businessProfile = rows[0];

  if (!businessProfile) {
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM parking_zones');
    await client.query('DELETE FROM slots');
    return;
  }

  const { rows: slotCountRows } = await client.query('SELECT COUNT(*)::int AS count FROM slots');
  const { rows: zoneCountRows } = await client.query('SELECT COUNT(*)::int AS count FROM parking_zones');

  if (slotCountRows[0].count === 0) {
      const slots = createInitialSlots(businessProfile.total_slots);
    await seedCollection(
      client,
      'slots',
      ['id', 'number', 'status', 'vehicle_number', 'time_elapsed', 'booked_by'],
      slots.map((slot) => ({
        id: slot.id,
        number: slot.number,
        status: slot.status,
        vehicle_number: slot.vehicleNumber ?? null,
        time_elapsed: slot.timeElapsed ?? null,
        booked_by: slot.bookedBy ?? null,
      })),
    );
  }

  if (zoneCountRows[0].count === 0) {
    const zones = createDefaultZones(businessProfile.total_slots, Number(businessProfile.price_per_hour));
    await seedCollection(client, 'parking_zones', ['id', 'name', 'capacity', 'type', 'rate'], zones);
  }
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
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!profile) {
    throw new Error('Register the parking business before signing in.');
  }

  if (String(profile.contact_email || '').trim().toLowerCase() !== normalizedEmail) {
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
    const isFirstRegistration = existingProfileResult.rows.length === 0;
    const nextPasswordHash = profile.adminPassword
      ? hashPassword(profile.adminPassword)
      : existingPasswordHash;

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

    // SmartParking Aggregator now reads directly from the business_profile table!

    await client.query('DELETE FROM slots');
    await client.query('DELETE FROM parking_zones');
    if (isFirstRegistration) {
      await client.query('DELETE FROM bookings');
      await client.query('DELETE FROM payments');
    }

    const slots = createInitialSlots(profile.totalSlots);
    const zones = createDefaultZones(profile.totalSlots, profile.pricePerHour);

    await seedCollection(
      client,
      'slots',
      ['id', 'number', 'status', 'vehicle_number', 'time_elapsed', 'booked_by'],
      slots.map((slot) => ({
        id: slot.id,
        number: slot.number,
        status: slot.status,
        vehicle_number: slot.vehicleNumber ?? null,
        time_elapsed: slot.timeElapsed ?? null,
        booked_by: slot.bookedBy ?? null,
      })),
    );

    await seedCollection(
      client,
      'parking_zones',
      ['id', 'name', 'capacity', 'type', 'rate'],
      zones,
    );

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
  const { rows } = await pool.query('SELECT id, "user", vehicle, time, status FROM bookings ORDER BY time DESC');
  return rows.map(mapBooking);
};

export const updateBooking = async (bookingId, updates) => {
  const existing = await pool.query('SELECT id, "user", vehicle, time, status FROM bookings WHERE id = $1', [bookingId]);
  if (existing.rows.length === 0) return null;

  const next = { ...mapBooking(existing.rows[0]), ...updates };
  const { rows } = await pool.query(
    `
      UPDATE bookings
      SET "user" = $2, vehicle = $3, time = $4, status = $5
      WHERE id = $1
      RETURNING id, "user", vehicle, time, status
    `,
    [bookingId, next.user, next.vehicle, next.time, next.status],
  );

  return mapBooking(rows[0]);
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
  const zoneId = `zone-${Date.now()}`;
  const { rows } = await pool.query(
    `
      INSERT INTO parking_zones (id, name, capacity, type, rate)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [zoneId, zone.name, zone.capacity, zone.type, zone.rate],
  );

  return mapZone(rows[0]);
};

export const updateParkingZone = async (zoneId, updates) => {
  const existing = await pool.query('SELECT * FROM parking_zones WHERE id = $1', [zoneId]);
  if (existing.rows.length === 0) return null;

  const next = { ...mapZone(existing.rows[0]), ...updates };
  const { rows } = await pool.query(
    `
      UPDATE parking_zones
      SET name = $2, capacity = $3, type = $4, rate = $5
      WHERE id = $1
      RETURNING *
    `,
    [zoneId, next.name, next.capacity, next.type, next.rate],
  );

  return mapZone(rows[0]);
};

export const deleteParkingZone = async (zoneId) => {
  const result = await pool.query('DELETE FROM parking_zones WHERE id = $1', [zoneId]);
  return result.rowCount > 0;
};

export const getDashboardStats = async () => {
  const [slotStats, paymentStats] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_slots,
        COUNT(*) FILTER (WHERE status IN ('occupied', 'overstay'))::int AS occupied_count,
        COUNT(*) FILTER (WHERE status = 'free')::int AS available_count
      FROM slots
    `),
    pool.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'Paid'), 0)::numeric AS revenue
      FROM payments
    `),
  ]);

  return {
    totalSlots: slotStats.rows[0]?.total_slots ?? 0,
    occupiedCount: slotStats.rows[0]?.occupied_count ?? 0,
    availableCount: slotStats.rows[0]?.available_count ?? 0,
    revenue: Number(paymentStats.rows[0]?.revenue ?? 0),
  };
};

export const closeStore = async () => {
  await pool.end();
};
