import http from 'node:http';
import { parse } from 'node:url';
import { loadEnvFile } from './lib/env.js';
import {
  authenticateAdmin,
  createBooking,
  createParkingZone,
  deleteParkingZone,
  getBookings,
  getBusinessProfile,
  getDashboardStats,
  getParkingZones,
  getPayments,
  getSlots,
  initializeStore,
  saveBusinessProfile,
  updateBooking,
  updateParkingZone,
  updateSlot,
} from './lib/pmsStore.js';
import { handleOptions, parseJsonBody, sendJson } from './lib/http.js';

loadEnvFile();

const PORT = Number(process.env.PORT || 4000);

const sendNotFound = (response) => sendJson(response, 404, { message: 'Route not found' });
const sendBadRequest = (response, message) => sendJson(response, 400, { message });

const server = http.createServer(async (request, response) => {
  if (handleOptions(request, response)) {
    return;
  }

  const { pathname = '' } = parse(request.url || '', true);

  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseJsonBody(request);

      if (!body.email || !body.password) {
        sendBadRequest(response, 'Email and password are required.');
        return;
      }

      sendJson(response, 200, {
        user: await authenticateAdmin({
          email: body.email,
          password: body.password,
        }),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      sendJson(response, 200, { success: true });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/business-profile') {
      sendJson(response, 200, await getBusinessProfile());
      return;
    }

    if (request.method === 'POST' && pathname === '/api/business-profile') {
      const body = await parseJsonBody(request);
      sendJson(response, 200, await saveBusinessProfile(body));
      return;
    }

    if (request.method === 'GET' && pathname === '/api/dashboard/stats') {
      sendJson(response, 200, await getDashboardStats());
      return;
    }

    if (request.method === 'GET' && pathname === '/api/slots') {
      sendJson(response, 200, await getSlots());
      return;
    }

    if (request.method === 'PATCH' && pathname.startsWith('/api/slots/')) {
      const slotId = pathname.split('/').pop();
      const updates = await parseJsonBody(request);
      const slot = await updateSlot(slotId, updates);

      if (!slot) {
        sendNotFound(response);
        return;
      }

      sendJson(response, 200, slot);
      return;
    }

    if (request.method === 'GET' && pathname === '/api/bookings') {
      sendJson(response, 200, await getBookings());
      return;
    }

    if (request.method === 'POST' && pathname === '/api/bookings') {
      const body = await parseJsonBody(request);
      sendJson(response, 201, await createBooking(body));
      return;
    }

    if (request.method === 'PATCH' && pathname.startsWith('/api/bookings/')) {
      const bookingId = pathname.split('/').pop();
      const updates = await parseJsonBody(request);
      const booking = await updateBooking(bookingId, updates);

      if (!booking) {
        sendNotFound(response);
        return;
      }

      sendJson(response, 200, booking);
      return;
    }

    if (request.method === 'GET' && pathname === '/api/payments') {
      sendJson(response, 200, await getPayments());
      return;
    }

    if (request.method === 'GET' && pathname === '/api/parking-zones') {
      sendJson(response, 200, await getParkingZones());
      return;
    }

    if (request.method === 'POST' && pathname === '/api/parking-zones') {
      const body = await parseJsonBody(request);
      sendJson(response, 201, await createParkingZone(body));
      return;
    }

    if (request.method === 'PATCH' && pathname.startsWith('/api/parking-zones/')) {
      const zoneId = pathname.split('/').pop();
      const updates = await parseJsonBody(request);
      const zone = await updateParkingZone(zoneId, updates);

      if (!zone) {
        sendNotFound(response);
        return;
      }

      sendJson(response, 200, zone);
      return;
    }

    if (request.method === 'DELETE' && pathname.startsWith('/api/parking-zones/')) {
      const zoneId = pathname.split('/').pop();
      const deleted = await deleteParkingZone(zoneId);
      sendJson(response, 200, { success: deleted });
      return;
    }

    sendNotFound(response);
  } catch (error) {
    sendJson(response, 500, {
      message: error instanceof Error ? error.message : 'Unexpected server error',
    });
  }
});

initializeStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PMS backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize PostgreSQL store:', error);
    process.exit(1);
  });
