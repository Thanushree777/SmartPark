
// ==========================================
// SMARTPARK ADMIN DASHBOARD
// ==========================================

// Load dashboard when page opens
document.addEventListener("DOMContentLoaded", function () {
    setDefaultReportPeriod();

    loadDashboard();
    loadBookings();
    loadActivityLogs();
    loadOverstayVehicles();
    loadParkingSlots();

    document.getElementById("updateReportBtn")
        ?.addEventListener("click", loadAvailabilityReport);

    document.getElementById("addSlotForm")
        ?.addEventListener("submit", addParkingSlot);

    document.getElementById("refreshOverstayBtn")
        ?.addEventListener("click", loadOverstayVehicles);

    document.getElementById("verifyManualQrBtn")
        ?.addEventListener("click", verifyManualQr);

    document.getElementById("adminLogoutBtn")
        ?.addEventListener("click", adminLogout);

    initializeQrScanner();
});


// ==========================================
// DEFAULT REPORT DATE AND TIME
// ==========================================

function setDefaultReportPeriod() {
    const date = document.getElementById("reportDate");
    const start = document.getElementById("reportStartTime");
    const end = document.getElementById("reportEndTime");

    if (date && !date.value) {
        date.value = new Date().toISOString().split("T")[0];
    }

    if (start && !start.value) {
        start.value = "09:00";
    }

    if (end && !end.value) {
        end.value = "18:00";
    }
}


// ==========================================
// DASHBOARD STATISTICS
// ==========================================

async function loadDashboard() {
    try {
        const [slotsResponse, bookingsResponse] = await Promise.all([
            fetch("/api/slots"),
            fetch("/api/admin/bookings")
        ]);

        if (!slotsResponse.ok || !bookingsResponse.ok) {
            throw new Error("Unable to load dashboard information.");
        }

        const slots = await slotsResponse.json();
        const bookings = await bookingsResponse.json();

        const total = slots.length;

        const occupied = bookings.filter(booking =>
            booking.status === "Confirmed" &&
            booking.check_in_time &&
            !booking.check_out_time
        ).length;

        document.getElementById("totalSlots").textContent = total;
        document.getElementById("occupiedSlots").textContent = occupied;
        document.getElementById("confirmedBookings").textContent =
            bookings.filter(booking =>
                booking.status === "Confirmed"
            ).length;

        await loadAvailabilityReport();

    } catch (error) {
        console.error("Dashboard error:", error);
    }
}


// ==========================================
// PARKING AVAILABILITY REPORT
// ==========================================

async function loadAvailabilityReport() {
    const date = document.getElementById("reportDate").value;
    const start = document.getElementById("reportStartTime").value;
    const end = document.getElementById("reportEndTime").value;
    const message = document.getElementById("reportMessage");

    if (!date || !start || !end) {
        message.textContent = "Please select date and time.";
        return;
    }

    if (start >= end) {
        message.textContent = "End time must be later than start time.";
        return;
    }

    try {
        const response = await fetch(
            `/api/slots?date=${encodeURIComponent(date)}&start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}`
        );

        const slots = await response.json();

        if (!response.ok) {
            throw new Error(slots.error || "Unable to load availability.");
        }

        const available = slots.filter(slot =>
            slot.status === "Available"
        ).length;

        const reserved = slots.filter(slot =>
            slot.status === "Reserved"
        ).length;

        document.getElementById("totalSlots").textContent = slots.length;
        document.getElementById("availableSlots").textContent = available;
        document.getElementById("reservedSlots").textContent = reserved;

        message.textContent = "Availability report updated successfully.";
        message.style.color = "green";

    } catch (error) {
        message.textContent = error.message;
        message.style.color = "red";
        console.error(error);
    }
}


// ==========================================
// LOAD PARKING SLOTS
// ==========================================

async function loadParkingSlots() {
    const container = document.getElementById("adminSlots");

    try {
        const response = await fetch("/api/slots");

        if (!response.ok) {
            throw new Error("Unable to load parking slots.");
        }

        const slots = await response.json();

        container.innerHTML = "";

        if (slots.length === 0) {
            container.textContent = "No parking slots available.";
            return;
        }

        slots.forEach(slot => {
            const item = document.createElement("div");
            item.className = "booking-item";

            const details = document.createElement("p");
            details.textContent =
                `${slot.slot_number} - ${slot.status}`;

            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Delete Slot";
            deleteButton.className = "admin-button";
            deleteButton.addEventListener("click", () =>
                deleteParkingSlot(slot.id)
            );

            item.appendChild(details);
            item.appendChild(deleteButton);
            container.appendChild(item);
        });

    } catch (error) {
        container.textContent = error.message;
        console.error(error);
    }
}


// ==========================================
// ADD PARKING SLOT
// ==========================================

async function addParkingSlot(event) {
    event.preventDefault();

    const input = document.getElementById("newSlotNumber");
    const message = document.getElementById("slotMessage");

    const slotNumber = input.value.trim().toUpperCase();

    try {
        const response = await fetch("/api/admin/slots", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                slot_number: slotNumber
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to add slot.");
        }

        message.textContent = data.message;
        message.style.color = "green";

        input.value = "";

        loadParkingSlots();
        loadDashboard();

    } catch (error) {
        message.textContent = error.message;
        message.style.color = "red";
    }
}


// ==========================================
// DELETE PARKING SLOT
// ==========================================

async function deleteParkingSlot(slotId) {
    if (!confirm("Are you sure you want to delete this parking slot?")) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/slots/${slotId}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to delete slot.");
        }

        alert(data.message);

        loadParkingSlots();
        loadDashboard();

    } catch (error) {
        alert(error.message);
    }
}


// ==========================================
// CUSTOMER BOOKING HISTORY
// ==========================================

async function loadBookings() {
    const history = document.getElementById("adminBookings");

    if (!history) return;

    try {
        const response = await fetch("/api/admin/bookings");

        if (!response.ok) {
            throw new Error("Unable to load admin booking records.");
        }

        const bookings = await response.json();

        history.innerHTML = "";

        if (bookings.length === 0) {
            history.textContent = "No bookings available yet.";
            return;
        }

        bookings.forEach(booking => {
            const item = document.createElement("div");
            item.className = "booking-item";

            const heading = document.createElement("h3");
            heading.textContent = `Booking ID: ${booking.id}`;

            const details = document.createElement("p");
            details.textContent =
                `Customer: ${booking.customer_name} | Vehicle: ${booking.vehicle_number} | Slot: ${booking.slot_number} | Date: ${booking.booking_date} | Time: ${booking.start_time} - ${booking.end_time}`;

            const status = document.createElement("p");
            status.textContent = `Status: ${booking.status}`;

            const checkIn = document.createElement("p");
            checkIn.textContent =
                `Check-in: ${booking.check_in_time || "Not checked in"}`;

            const checkOut = document.createElement("p");
            checkOut.textContent =
                `Check-out: ${booking.check_out_time || "Not checked out"}`;

            item.append(heading, details, status, checkIn, checkOut);

            if (booking.status === "Confirmed") {
                if (!booking.check_in_time) {
                    const checkInButton = document.createElement("button");
                    checkInButton.textContent = "Check In";
                    checkInButton.addEventListener("click", () =>
                        checkInVehicle(booking.id)
                    );
                    item.appendChild(checkInButton);
                } else if (!booking.check_out_time) {
                    const checkOutButton = document.createElement("button");
                    checkOutButton.textContent = "Check Out";
                    checkOutButton.addEventListener("click", () =>
                        checkOutVehicle(booking.id)
                    );
                    item.appendChild(checkOutButton);
                }
            }

            history.appendChild(item);
        });

    } catch (error) {
        history.textContent = error.message;
        console.error(error);
    }
}


// ==========================================
// VEHICLE CHECK-IN
// ==========================================

async function checkInVehicle(bookingId) {
    try {
        const response = await fetch(
            `/api/admin/bookings/${bookingId}/check-in`,
            { method: "POST" }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Check-in failed.");
        }

        alert(data.message);

        loadBookings();
        loadActivityLogs();
        loadDashboard();

    } catch (error) {
        alert(error.message);
    }
}


// ==========================================
// VEHICLE CHECK-OUT
// ==========================================

async function checkOutVehicle(bookingId) {
    try {
        const response = await fetch(
            `/api/admin/bookings/${bookingId}/check-out`,
            { method: "POST" }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Check-out failed.");
        }

        alert(data.message);

        loadBookings();
        loadActivityLogs();
        loadDashboard();
        loadOverstayVehicles();

    } catch (error) {
        alert(error.message);
    }
}


// ==========================================
// ACTIVITY LOGS
// ==========================================

async function loadActivityLogs() {
    const container = document.getElementById("activityLogs");

    try {
        const response = await fetch("/api/admin/activity-logs");

        if (!response.ok) {
            throw new Error("Unable to load activity logs.");
        }

        const logs = await response.json();

        container.innerHTML = "";

        if (logs.length === 0) {
            container.textContent = "No activity recorded yet.";
            return;
        }

        logs.forEach(log => {
            const item = document.createElement("div");
            item.className = "booking-item";

            const heading = document.createElement("h3");
            heading.textContent = log.action;

            const description = document.createElement("p");
            description.textContent = log.description;

            const date = document.createElement("small");
            date.textContent = log.created_at;

            item.append(heading, description, date);
            container.appendChild(item);
        });

    } catch (error) {
        container.textContent = error.message;
        console.error(error);
    }
}


// ==========================================
// VEHICLE OVERSTAY REPORT
// ==========================================

async function loadOverstayVehicles() {
    const container = document.getElementById("overstayVehicles");
    const count = document.getElementById("overstayCount");

    try {
        const response = await fetch("/api/admin/overstay");
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to load overstay report.");
        }

        const vehicles = data.overstay_vehicles || [];

        count.textContent = data.total_overstay_vehicles ?? vehicles.length;
        container.innerHTML = "";

        if (vehicles.length === 0) {
            container.textContent = "No overstay vehicles detected.";
            return;
        }

        vehicles.forEach(vehicle => {
            const item = document.createElement("div");
            item.className = "booking-item";

            item.textContent =
                `Booking ID: ${vehicle.booking_id} | Customer: ${vehicle.customer_name} | Vehicle: ${vehicle.vehicle_number} | Slot: ${vehicle.slot_number} | Overstay: ${vehicle.overstay_duration}`;

            container.appendChild(item);
        });

    } catch (error) {
        count.textContent = "!";
        container.textContent = error.message;
        console.error(error);
    }
}


// ==========================================
// MANUAL QR VERIFICATION
// ==========================================

async function verifyManualQr() {
    const tokenInput = document.getElementById("manualQrToken");
    const token = tokenInput.value.trim();

    if (!token) {
        alert("Please enter a QR token.");
        return;
    }

    await verifySmartParkQr(token);
}


// ==========================================
// VERIFY QR TOKEN
// ==========================================

async function verifySmartParkQr(token) {
    const result = document.getElementById("qrVerificationResult");

    try {
        const response = await fetch("/api/admin/verify-qr", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                qr_token: token
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "QR verification failed.");
        }

        result.textContent =
            `${data.message} Booking: ${data.booking_id}, Customer: ${data.customer_name}, Vehicle: ${data.vehicle_number}, Slot: ${data.slot_number}`;

        result.style.color = "green";

        document.getElementById("manualQrToken").value = "";

        loadBookings();
        loadActivityLogs();
        loadDashboard();

    } catch (error) {
        result.textContent = error.message;
        result.style.color = "red";
    }
}


// ==========================================
// QR CAMERA SCANNER
// ==========================================

function initializeQrScanner() {
    const reader = document.getElementById("qr-reader");

    if (!reader || typeof Html5QrcodeScanner === "undefined") {
        console.log("Camera QR scanner library not loaded. Manual verification is available.");
        return;
    }

    const scanner = new Html5QrcodeScanner(
        "qr-reader",
        {
            fps: 10,
            qrbox: 250
        },
        false
    );

    scanner.render(
        async function(decodedText) {
            await verifySmartParkQr(decodedText);
            scanner.clear().catch(error => console.error(error));
        },
        function(errorMessage) {
            // Ignore normal scanning messages.
        }
    );
}


// ==========================================
// ADMIN LOGOUT
// ==========================================

async function adminLogout() {
    try {
        const response = await fetch("/api/admin/logout", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Logout failed.");
        }

        window.location.href = "/admin-login";

    } catch (error) {
        alert(error.message);
    }
}
