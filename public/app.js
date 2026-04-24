let allParkingData = [];
let currentUser = null; // Store user details { id, name, email }

document.addEventListener('DOMContentLoaded', () => {
    // Auth listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    
    // Booking listener
    document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);

    // Initial check
    checkExistingSession();
});

function checkExistingSession() {
    const savedUser = localStorage.getItem('smartpark_user');
    if(savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }
}

function toggleAuthMode() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const subtitle = document.getElementById('auth-subtitle');
    
    if(!loginForm.classList.contains('hidden')) {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        subtitle.textContent = "Create an account to continue";
    } else {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        subtitle.textContent = "Login to manage your parking";
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const msgBox = document.getElementById('login-msg');
    btn.disabled = true;
    
    try {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const res = await fetch('/api/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        if(res.ok) {
            currentUser = data.user;
            localStorage.setItem('smartpark_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            throw new Error(data.message || 'Login failed');
        }
    } catch(err) {
        msgBox.textContent = err.message;
        msgBox.className = 'status-msg show error';
    } finally {
        btn.disabled = false;
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const msgBox = document.getElementById('signup-msg');
    btn.disabled = true;
    
    try {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const password = document.getElementById('signup-password').value;

        const res = await fetch('/api/user/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        
        const data = await res.json();
        if(res.ok) {
            currentUser = data.user;
            localStorage.setItem('smartpark_user', JSON.stringify(currentUser));
            showDashboard();
        } else {
            throw new Error(data.message || 'Signup failed');
        }
    } catch(err) {
        msgBox.textContent = err.message;
        msgBox.className = 'status-msg show error';
    } finally {
        btn.disabled = false;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('smartpark_user');
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    
    // Clear forms
    document.getElementById('login-form').reset();
    document.getElementById('signup-form').reset();
    document.getElementById('login-msg').className = 'status-msg hidden';
    document.getElementById('signup-msg').className = 'status-msg hidden';
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('display-user-name').textContent = currentUser.name || "User";
    
    // Set default datetime for booking to current time + 30 mins
    const startTimeInput = document.getElementById('startTime');
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    startTimeInput.value = now.toISOString().slice(0, 16);

    fetchParkingSlots();
}

async function fetchParkingSlots() {
    const listContainer = document.getElementById('parking-list');
    const selectPraking = document.getElementById('parkingSelect');
    
    try {
        const response = await fetch('/parking');
        const data = await response.json();
        console.log("Parking API data:", data);
        allParkingData = Array.isArray(data) ? data : [];
        
        listContainer.innerHTML = '';
        selectPraking.innerHTML = '<option value="" disabled selected>Select Location</option>';

        if (allParkingData.length === 0) {
            listContainer.innerHTML = '<p class="text-muted">No parking locations found.</p>';
            return;
        }

        allParkingData.forEach(parking => {
            const isAvailable = parking.availableSlots > 0 && parking.isOpen;
            
            // Add to List
            const pc = document.createElement('div');
            pc.className = 'parking-item';
            pc.onclick = () => { selectPraking.value = parking.id; };
            
            pc.innerHTML = `
                <div class="parking-header">
                    <span class="parking-title">${parking.parking_name}</span>
                    <span class="badge ${isAvailable ? '' : 'closed'}">
                        ${parking.isOpen ? (parking.availableSlots > 0 ? parking.availableSlots + ' Slots' : 'Full') : 'Closed'}
                    </span>
                </div>
                <div class="parking-details">
                    <span class="detail-item">📍 ${parking.full_address || 'Location Details'}</span>
                    <span class="detail-item price">₹${parking.price_per_hour}/hr</span>
                    <span class="detail-item">🕒 ${parking.openingTime} - ${parking.closingTime}</span>
                </div>
            `;
            listContainer.appendChild(pc);

            // Add to Select Dropdown
            if(isAvailable) {
                const opt = document.createElement('option');
                opt.value = parking.id;
                opt.textContent = `${parking.parking_name} (₹${parking.price_per_hour}/hr)`;
                selectPraking.appendChild(opt);
            }
        });

    } catch (err) {
        console.error(err);
        listContainer.innerHTML = '<p style="color:var(--danger)">Failed to load data.</p>';
    }
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    if(!currentUser) {
        alert("Please login first!");
        return logout();
    }

    const btn = document.getElementById('bookBtn');
    const msgBox = document.getElementById('booking-status');
    
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:20px;height:20px;margin:0;display:inline-block;border-width:2px;vertical-align:middle;"></div>';
    
    msgBox.className = 'status-msg hidden';

    const parkingId = document.getElementById('parkingSelect').value;
    const vehicleNumber = document.getElementById('vehicleNumber').value;
    const hours = document.getElementById('hours').value;
    const startTimeStr = document.getElementById('startTime').value;
    
    // Calculate end time
    const startTime = new Date(startTimeStr);
    const endTime = new Date(startTime.getTime() + (hours * 60 * 60 * 1000));

    const selectedParking = allParkingData.find(p => p.id === parkingId);

    const bookingPayload = {
        userId: currentUser.id || "web-user",
        userName: currentUser.name || "Guest",
        userEmail: currentUser.email || "",
        phone: currentUser.phone || "0000000000",
        vehicleNumber: vehicleNumber,
        parkingId: parkingId,
        parkingName: selectedParking ? selectedParking.parking_name : "Unknown",
        hours: parseInt(hours),
        pricePerHour: selectedParking ? selectedParking.price_per_hour : 0,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
    };

    try {
        const res = await fetch('/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        const data = await res.json();

        if(res.ok) {
            msgBox.textContent = `Booking Success! Check-in required at ${startTime.toLocaleTimeString()}.`;
            msgBox.className = 'status-msg show success';
            fetchParkingSlots(); // Refresh slot availability
        } else {
            throw new Error(data.message || 'Booking failed');
        }

    } catch (err) {
        msgBox.textContent = err.message;
        msgBox.className = 'status-msg show error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-text">Confirm Booking</span>';
    }
}
