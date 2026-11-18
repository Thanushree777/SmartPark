let selectedSlotNumber = null;


// Load parking slots
async function loadSlots() {

    const container = document.getElementById("slotContainer");
    const message = document.getElementById("message");

    try {

        const bookingDate = document.getElementById("bookingDate")?.value;
const startTime = document.getElementById("startTime")?.value;
const endTime = document.getElementById("endTime")?.value;

let slotsUrl = "/api/slots";

if (bookingDate && startTime && endTime) {
    const params = new URLSearchParams({
        date: bookingDate,
        start_time: startTime,
        end_time: endTime
    });

    slotsUrl += "?" + params.toString();
}

const response = await fetch(slotsUrl);

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

    const bookingSection = document.getElementById("bookingSection");
    const selectedSlot = document.getElementById("selectedSlot");
    const bookingResult = document.getElementById("bookingResult");

    if (!bookingSection) {
        console.error("bookingSection element is missing in index.html");
        alert("Booking form section is missing. Please check index.html.");
        return;
    }

    if (selectedSlot) {
        selectedSlot.textContent = "Selected Parking Slot: " + slotNumber;
    }

    if (bookingResult) {
        bookingResult.textContent = "";
    }

    bookingSection.style.display = "block";

    bookingSection.scrollIntoView({
        behavior: "smooth",
        block: "center"
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
            console.log("QR section found:", !!document.getElementById("qrPassSection"));
            
    
// Display QR Parking Pass
const qrPassSection = document.getElementById("qrPassSection");
const bookingQrImage = document.getElementById("bookingQrImage");
const qrBookingDetails = document.getElementById("qrBookingDetails");

if (!qrPassSection || !bookingQrImage || !qrBookingDetails) {
    console.error("QR elements not found in index.html");
    result.textContent =
        "Booking successful, but QR section elements are missing.";
} else {
    // Show the QR section
    qrPassSection.style.display = "block";
    qrPassSection.style.visibility = "visible";

    // Show booking details
    qrBookingDetails.textContent =
        `Booking ID: ${data.booking_id} | Slot: ${data.slot_number}`;

    // Load QR image
    bookingQrImage.onload = function () {
        console.log("QR image loaded successfully.");

        qrPassSection.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    };

    bookingQrImage.onerror = function () {
        console.error("QR image failed to load:", bookingQrImage.src);

        qrBookingDetails.textContent =
            "Booking confirmed, but QR image could not be loaded.";
    };

    bookingQrImage.src =
        `/api/booking-qr/${encodeURIComponent(data.qr_token)}?t=${Date.now()}`;
}


        } catch (error) {
            result.textContent = error.message;
            result.style.color = "#DC2626";
        }
    }
);

// Load slots when page opens
document.addEventListener("DOMContentLoaded", () => {
    loadSlots();
});
// Refresh slot availability when booking date or time changes
document.getElementById("bookingDate")?.addEventListener("change", loadSlots);
document.getElementById("startTime")?.addEventListener("change", loadSlots);
document.getElementById("endTime")?.addEventListener("change", loadSlots);
// SmartPark Smart Slot Recommendation
document.getElementById("recommendBtn")?.addEventListener("click", async function () {
    const date = document.getElementById("bookingDate")?.value;
    const startTime = document.getElementById("startTime")?.value;
    const endTime = document.getElementById("endTime")?.value;
    const result = document.getElementById("recommendationResult");

    if (!date || !startTime || !endTime) {
        result.textContent = "Please select your booking date, start time and end time first.";
        return;
    }

    result.textContent = "Finding the best available parking slot...";

    try {
        const params = new URLSearchParams({
            date: date,
            start_time: startTime,
            end_time: endTime
        });

        const response = await fetch("/api/recommend-slot?" + params);
        const data = await response.json();

        if (!response.ok) {
            result.textContent = data.message || data.error || "No available slot found.";
            return;
        }

        result.innerHTML = `
            <div class="recommended-card">
                <h3>✨ Recommended for You</h3>
                <h2>${data.recommended_slot}</h2>
                <p>${data.message}</p>
                <p><strong>Why this slot?</strong> ${data.reason}</p>
                <p><strong>Available slots:</strong> ${data.available_slots_count}</p>
                <p><strong>Method:</strong> ${data.recommendation_method}</p>
            
            </div>
        `;

    } catch (error) {
        result.textContent = "Unable to get a recommendation. Please try again.";
    }
});

// =====================================
// DOWNLOAD SMARTPARK QR PASS
// =====================================

document.getElementById("downloadQrBtn")?.addEventListener("click", function () {

    const qrImage = document.getElementById("bookingQrImage");

    if (!qrImage || !qrImage.src || !qrImage.complete || qrImage.naturalWidth === 0) {
        alert("Please wait until your QR code has loaded.");
        return;
    }

    const downloadLink = document.createElement("a");

    downloadLink.href = qrImage.src;
    downloadLink.download = "SmartPark_QR_Pass.png";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

});
