// Load admin dashboard data
async function loadAdminDashboard() {
    try {
        const slotsResponse = await fetch("/api/slots");
        const bookingsResponse = await fetch("/api/admin/bookings");

        if (!slotsResponse.ok || !bookingsResponse.ok) {
            throw new Error("Unable to load dashboard data");
        }

        const slots = await slotsResponse.json();
        const bookings = await bookingsResponse.json();

        document.getElementById("totalSlots").textContent = slots.length;

        document.getElementById("availableSlots").textContent =
            slots.filter(slot => slot.status === "Available").length;

        document.getElementById("confirmedBookings").textContent =
            bookings.filter(b => b.status === "Confirmed").length;

        displayAdminSlots(slots);
        displayAdminBookings(bookings);

    } catch (error) {
        console.error(error);
        document.getElementById("adminSlots").textContent =
            "Unable to load parking slots.";
        document.getElementById("adminBookings").textContent =
            "Unable to load bookings.";
    }
}


// Display parking slots with delete buttons
function displayAdminSlots(slots) {
    const container = document.getElementById("adminSlots");
    container.innerHTML = "";

    slots.forEach(slot => {
        const item = document.createElement("div");
        item.className = "booking-item";

        const details = document.createElement("span");
        details.textContent = `${slot.slot_number} - ${slot.status} `;

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "admin-button";
        deleteButton.type = "button";

        deleteButton.addEventListener("click", () => {
            deleteSlot(slot.id);
        });

        item.appendChild(details);
        item.appendChild(deleteButton);
        container.appendChild(item);
    });
}


// Display customer bookings
function displayAdminBookings(bookings) {
    const container = document.getElementById("adminBookings");
    container.innerHTML = "";

    if (bookings.length === 0) {
        container.textContent = "No bookings available.";
        return;
    }

    bookings.forEach(booking => {
        const item = document.createElement("div");
        item.className = "booking-item";

        const heading = document.createElement("h3");
        heading.textContent = `Booking #${booking.id}`;

        const details = document.createElement("p");
        details.textContent =
            `${booking.customer_name} | ${booking.vehicle_number} | ` +
            `${booking.slot_number} | ${booking.booking_date} | ` +
            `${booking.start_time}-${booking.end_time} | ${booking.status}`;

        item.appendChild(heading);
        item.appendChild(details);
        container.appendChild(item);
    });
}


// Add a new parking slot
document.getElementById("addSlotForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const slotNumber = document.getElementById("newSlotNumber").value.trim();
    const message = document.getElementById("slotMessage");

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

        const result = await response.json();

        if (!response.ok) {
            message.textContent = result.error || "Unable to add slot.";
            return;
        }

        message.textContent = result.message;
        document.getElementById("addSlotForm").reset();

        await loadAdminDashboard();

    } catch (error) {
        message.textContent = "Server connection error.";
        console.error(error);
    }
});


// Delete a parking slot
async function deleteSlot(slotId) {
    if (!confirm("Are you sure you want to delete this parking slot?")) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/slots/${slotId}`, {
            method: "DELETE"
        });

        const result = await response.json();

        alert(result.message || result.error);

        if (response.ok) {
            await loadAdminDashboard();
        }

    } catch (error) {
        alert("Unable to connect to server.");
        console.error(error);
    }
}


// Start dashboard
document.addEventListener("DOMContentLoaded", loadAdminDashboard);
document.getElementById("adminLogoutBtn").addEventListener("click", async function () {
    try {
        const response = await fetch("/api/admin/logout", {
            method: "POST"
        });

        if (response.ok) {
            window.location.href = "/admin-login";
        } else {
            alert("Logout failed. Please try again.");
        }
    } catch (error) {
        alert("Server connection error.");
        console.error(error);
    }
});
