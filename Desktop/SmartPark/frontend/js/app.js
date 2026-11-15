let selectedSlotNumber = null;


// Load parking slots
async function loadSlots() {

    const container = document.getElementById("slotContainer");
    const message = document.getElementById("message");

    try {

        const response = await fetch("/api/slots");

        if (!response.ok) {
            throw new Error("Unable to load parking slots.");
        }

        const slots = await response.json();

        const total = slots.length;

        const available = slots.filter(
            slot => slot.status === "Available"
        ).length;

        const occupied = slots.filter(
            slot => slot.status === "Occupied"
        ).length;

        const reserved = slots.filter(
            slot => slot.status === "Reserved"
        ).length;

        document.getElementById("totalSlots").textContent = total;
        document.getElementById("availableSlots").textContent = available;
        document.getElementById("occupiedSlots").textContent = occupied;
        document.getElementById("reservedSlots").textContent = reserved;

        container.innerHTML = "";

        slots.forEach(slot => {

            const card = document.createElement("div");

            card.className = "slot " + slot.status.toLowerCase();

            card.innerHTML = `
                <h3>${slot.slot_number}</h3>
                <p>${slot.status}</p>
            `;

            if (slot.status === "Available") {
                card.onclick = () => selectSlot(slot.slot_number);
            }

            container.appendChild(card);

        });

        message.textContent = "";

    } catch (error) {

        container.textContent = "Unable to load parking slots.";
        message.textContent = error.message;

    }
}


// Select a parking slot
function selectSlot(slotNumber) {

    selectedSlotNumber = slotNumber;

    document.getElementById("bookingSection").style.display = "block";

    document.getElementById("selectedSlot").textContent =
        "Selected Parking Slot: " + slotNumber;

    document.getElementById("bookingResult").textContent = "";

    document.getElementById("bookingSection").scrollIntoView({
        behavior: "smooth"
    });

}


// Submit booking form
document.getElementById("bookingForm").addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();

        if (!selectedSlotNumber) {
            alert("Please select a parking slot.");
            return;
        }

        const bookingData = {

            customer_name:
                document.getElementById("customerName").value,

            vehicle_number:
                document.getElementById("vehicleNumber").value,

            slot_number: selectedSlotNumber,

            booking_date:
                document.getElementById("bookingDate").value,

            start_time:
                document.getElementById("startTime").value,

            end_time:
                document.getElementById("endTime").value

        };

        const result = document.getElementById("bookingResult");

        result.textContent = "Processing booking...";

        try {

            const response = await fetch("/api/bookings", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(bookingData)

            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Booking failed.");
            }

            result.textContent =
                "Booking successful! Your Booking ID is: " +
                data.booking_id +
                ". Slot: " +
                data.slot_number;

            result.style.color = "#16A34A";

            document.getElementById("bookingForm").reset();

            selectedSlotNumber = null;

            document.getElementById("bookingSection").style.display = "none";

            alert(
                "Booking confirmed! Your Booking ID is " +
                data.booking_id
            );

            loadSlots();

        } catch (error) {

            result.textContent = error.message;
            result.style.color = "#DC2626";

        }

    }
);


// Load slots when page opens
document.addEventListener("DOMContentLoaded", () => {
    loadSlots();
    loadBookings();
    loadBookings();
});
// Load booking history
async function loadBookings() {

    const history = document.getElementById("bookingHistory");

    try {

        const response = await fetch("/api/bookings");

        if (!response.ok) {
            throw new Error("Unable to load booking history.");
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

            const statusClass =
                booking.status === "Cancelled"
                    ? "cancelled-label"
                    : "confirmed-label";

            item.innerHTML = `
                <h3>Booking ID: ${booking.id}</h3>
                <p><strong>Customer:</strong> ${booking.customer_name}</p>
                <p><strong>Vehicle:</strong> ${booking.vehicle_number}</p>
                <p><strong>Slot:</strong> ${booking.slot_number}</p>
                <p><strong>Date:</strong> ${booking.booking_date}</p>
                <p><strong>Time:</strong> ${booking.start_time} - ${booking.end_time}</p>
                <p class="${statusClass}">Status: ${booking.status}</p>
            `;

            if (booking.status === "Confirmed") {

                const cancelButton = document.createElement("button");

                cancelButton.textContent = "Cancel Booking";

                cancelButton.onclick = () => cancelBooking(booking.id);

                item.appendChild(cancelButton);

            }

            history.appendChild(item);

        });

    } catch (error) {

        history.textContent = error.message;

    }
}


// Cancel booking
async function cancelBooking(bookingId) {

    const confirmed = confirm(
        "Are you sure you want to cancel this booking?"
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `/api/bookings/${bookingId}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Cancellation failed.");
        }

        alert(data.message);

        loadBookings();
        loadSlots();

    } catch (error) {

        alert(error.message);

    }

}