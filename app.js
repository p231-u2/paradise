const STORAGE_KEY = 'bladebook_data_v1';
const BARBER_CREDENTIALS = { id: 'barber001', password: 'cutmaster123' };
const SERVICES = ['Haircut', 'Beard Trim', 'Shave', 'Hair Wash', 'Facial'];

const defaultData = {
  barberStatus: 'Offline',
  workingHours: { start: '09:00', end: '20:00' },
  bookings: [],
  unreadNotifications: 0,
};

const state = {
  role: null,
  selectedSlot: null,
  data: loadData(),
};

const authSection = document.getElementById('authSection');
const customerSection = document.getElementById('customerSection');
const barberSection = document.getElementById('barberSection');
const headerStatusChip = document.getElementById('headerStatusChip');
const customerStatusPill = document.getElementById('customerStatusPill');
const slotGrid = document.getElementById('slotGrid');
const customerServices = document.getElementById('customerServices');
const customerBookings = document.getElementById('customerBookings');
const pendingList = document.getElementById('pendingList');
const notificationBadge = document.getElementById('notificationBadge');
const statusButtons = document.getElementById('statusButtons');
const calendarView = document.getElementById('calendarView');
const toastContainer = document.getElementById('toastContainer');

init();

function init() {
  seedServices();
  seedStatusButtons();
  const today = getDateISO(new Date());
  document.getElementById('customerDate').value = today;
  document.getElementById('barberDate').value = today;
  setMinDates(today);

  document.getElementById('barberLoginBtn').addEventListener('click', barberLogin);
  document.getElementById('continueCustomerBtn').addEventListener('click', () => setRole('customer'));
  document.getElementById('customerDate').addEventListener('change', renderCustomerSlots);
  document.getElementById('submitBookingBtn').addEventListener('click', submitBooking);
  document.getElementById('barberDate').addEventListener('change', renderCalendar);
  document.getElementById('saveHoursBtn').addEventListener('click', saveWorkingHours);

  document.querySelectorAll('[data-action="logoutToAuth"]').forEach((btn) => {
    btn.addEventListener('click', () => setRole(null));
  });

  render();
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed ? { ...defaultData, ...parsed } : structuredClone(defaultData);
  } catch {
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function setRole(role) {
  state.role = role;
  if (role === 'barber') {
    state.data.unreadNotifications = 0;
    saveData();
  }
  render();
}

function barberLogin() {
  const id = document.getElementById('barberId').value.trim();
  const password = document.getElementById('barberPassword').value;
  if (id === BARBER_CREDENTIALS.id && password === BARBER_CREDENTIALS.password) {
    toast('Barber authenticated successfully.');
    setRole('barber');
  } else {
    toast('Invalid barber credentials.', true);
  }
}

function seedServices() {
  customerServices.innerHTML = '';
  SERVICES.forEach((service) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${service}" /> ${service}`;
    customerServices.appendChild(label);
  });
}

function seedStatusButtons() {
  const statuses = ['Available', 'Busy', 'On Break', 'Offline'];
  statusButtons.innerHTML = '';
  statuses.forEach((status) => {
    const btn = document.createElement('button');
    btn.textContent = status;
    btn.className = 'btn';
    btn.addEventListener('click', () => {
      state.data.barberStatus = status;
      saveData();
      renderStatus();
      toast(`Status updated to ${status}.`);
    });
    statusButtons.appendChild(btn);
  });
}

function render() {
  authSection.classList.toggle('hidden', !!state.role);
  customerSection.classList.toggle('hidden', state.role !== 'customer');
  barberSection.classList.toggle('hidden', state.role !== 'barber');
  renderStatus();

  if (state.role === 'customer') {
    renderCustomerSlots();
    renderCustomerBookings();
  }

  if (state.role === 'barber') {
    document.getElementById('startHour').value = state.data.workingHours.start;
    document.getElementById('endHour').value = state.data.workingHours.end;
    renderPendingBookings();
    renderCalendar();
    updateNotificationBadge();
  } else {
    updateNotificationBadge();
  }
}

function renderStatus() {
  const status = state.data.barberStatus;
  headerStatusChip.textContent = `Status: ${status}`;
  customerStatusPill.textContent = status;
  customerStatusPill.className = `pill ${statusToClass(status)}`;
}

function renderCustomerSlots() {
  const selectedDate = document.getElementById('customerDate').value;
  const slots = generateSlots(state.data.workingHours.start, state.data.workingHours.end, 30);
  const blocked = new Set(
    state.data.bookings
      .filter((b) => b.date === selectedDate && ['Pending', 'Confirmed'].includes(b.status))
      .map((b) => b.time)
  );

  slotGrid.innerHTML = '';
  state.selectedSlot = null;

  slots.forEach((time) => {
    const btn = document.createElement('button');
    btn.className = 'slot';
    btn.textContent = to12Hour(time);
    if (blocked.has(time)) {
      btn.classList.add('disabled');
      btn.title = 'Unavailable';
    } else {
      btn.addEventListener('click', () => {
        state.selectedSlot = time;
        [...slotGrid.children].forEach((el) => el.classList.remove('selected'));
        btn.classList.add('selected');
      });
    }
    slotGrid.appendChild(btn);
  });
}

function submitBooking() {
  const date = document.getElementById('customerDate').value;
  const phone = document.getElementById('customerPhone').value.trim();
  const services = [...customerServices.querySelectorAll('input:checked')].map((i) => i.value);

  if (!date || !state.selectedSlot || services.length === 0 || !/^\+?[0-9()\-\s]{7,20}$/.test(phone)) {
    toast('Please enter valid date, slot, services, and phone number.', true);
    return;
  }

  const isTaken = state.data.bookings.some(
    (b) => b.date === date && b.time === state.selectedSlot && ['Pending', 'Confirmed'].includes(b.status)
  );
  if (isTaken) {
    toast('That slot is already booked.', true);
    renderCustomerSlots();
    return;
  }

  const booking = {
    id: crypto.randomUUID(),
    date,
    time: state.selectedSlot,
    services,
    phone,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };

  state.data.bookings.push(booking);
  state.data.unreadNotifications += 1;
  saveData();
  toast('Booking request sent. Awaiting barber confirmation.');
  renderCustomerSlots();
  renderCustomerBookings();
  updateNotificationBadge();
}

function renderCustomerBookings() {
  customerBookings.innerHTML = '';
  const rows = [...state.data.bookings].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 8);
  if (!rows.length) {
    customerBookings.innerHTML = '<p class="small">No bookings yet.</p>';
    return;
  }

  rows.forEach((b) => customerBookings.appendChild(bookingItem(b, false)));
}

function renderPendingBookings() {
  pendingList.innerHTML = '';
  const rows = state.data.bookings.filter((b) => b.status === 'Pending');
  if (!rows.length) {
    pendingList.innerHTML = '<p class="small">No pending requests.</p>';
    return;
  }

  rows.forEach((b) => {
    const item = bookingItem(b, true);
    const actions = document.createElement('div');
    actions.className = 'button-row';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn btn-primary';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () => updateBookingStatus(b.id, 'Confirmed'));

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn';
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', () => updateBookingStatus(b.id, 'Rejected'));

    actions.append(acceptBtn, rejectBtn);
    item.appendChild(actions);
    pendingList.appendChild(item);
  });
}

function updateBookingStatus(id, status) {
  const booking = state.data.bookings.find((b) => b.id === id);
  if (!booking) return;

  if (status === 'Confirmed') {
    const duplicate = state.data.bookings.some(
      (b) => b.id !== id && b.date === booking.date && b.time === booking.time && b.status === 'Confirmed'
    );
    if (duplicate) {
      toast('Cannot confirm. Slot already confirmed for another booking.', true);
      return;
    }
  }

  booking.status = status;
  saveData();
  toast(`Booking ${status.toLowerCase()}.`);
  renderPendingBookings();
  renderCalendar();
  renderCustomerSlots();
  renderCustomerBookings();
}

function renderCalendar() {
  const date = document.getElementById('barberDate').value;
  const confirmed = state.data.bookings
    .filter((b) => b.date === date && b.status === 'Confirmed')
    .sort((a, b) => a.time.localeCompare(b.time));

  calendarView.innerHTML = '';
  if (!confirmed.length) {
    calendarView.innerHTML = '<p class="small">No confirmed bookings on selected date.</p>';
    return;
  }

  confirmed.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'calendar-row';
    row.innerHTML = `
      <strong>${to12Hour(b.time)}</strong>
      <div>
        <div class="mark"><span style="width:100%"></span></div>
        <small>${b.services.join(', ')} • ${b.phone}</small>
      </div>
    `;
    calendarView.appendChild(row);
  });
}

function saveWorkingHours() {
  const start = document.getElementById('startHour').value;
  const end = document.getElementById('endHour').value;
  if (!start || !end || start >= end) {
    toast('Please provide valid working hours.', true);
    return;
  }

  state.data.workingHours = { start, end };
  saveData();
  toast(`Working hours updated: ${to12Hour(start)} - ${to12Hour(end)}.`);
  if (state.role === 'customer') renderCustomerSlots();
}

function bookingItem(b, showPhone) {
  const item = document.createElement('article');
  item.className = 'booking-item';
  item.innerHTML = `
    <p><strong>${b.date}</strong> at <strong>${to12Hour(b.time)}</strong></p>
    <p>${b.services.join(', ')}</p>
    ${showPhone ? `<p>Phone: ${b.phone}</p>` : ''}
    <span class="status-tag ${statusClass(b.status)}">${b.status}</span>
  `;
  return item;
}

function updateNotificationBadge() {
  notificationBadge.textContent = `${state.data.unreadNotifications} New`;
}

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = isError ? 'rgba(239,68,68,.5)' : 'rgba(56,189,248,.5)';
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function generateSlots(startHHMM, endHHMM, interval) {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const slots = [];

  for (let t = start; t + interval <= end; t += interval) {
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function to12Hour(hhmm) {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

function statusClass(status) {
  return status === 'Confirmed' ? 'tag-confirmed' : status === 'Rejected' ? 'tag-rejected' : 'tag-pending';
}

function statusToClass(status) {
  if (status === 'Available') return 'available';
  if (status === 'Busy') return 'busy';
  if (status === 'On Break') return 'break';
  return 'offline';
}

function setMinDates(today) {
  document.getElementById('customerDate').min = today;
  document.getElementById('barberDate').min = today;
}

function getDateISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
