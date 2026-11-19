
let selectedSlotNumber = null;
window.currentBookingQrToken = null;
const CUSTOMER_BOOKING_TOKENS_KEY =
    "smartpark_customer_booking_tokens";

function getCustomerBookingTokens() {
    try {
        const tokens = JSON.parse(
            localStorage.getItem(CUSTOMER_BOOKING_TOKENS_KEY) || "[]"
        );

        return Array.isArray(tokens) ? tokens : [];
    } catch (error) {
        console.error("Unable to read saved booking tokens:", error);
        return [];
    }
}

function saveCustomerBookingToken(token) {
    if (typeof token !== "string" || !token) {
        return;
    }

    const tokens = getCustomerBookingTokens();

    if (!tokens.includes(token)) {
        tokens.push(token);
    }

    localStorage.setItem(
        CUSTOMER_BOOKING_TOKENS_KEY,
        JSON.stringify(tokens)
    );
}

// =====================================
// LOAD PARKING SLOTS
// =====================================

async function loadSlots() {
    const container = document.getElementById("slotContainer");
    const message = document.getElementById("message");

    if (!container || !message) return;

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

        document.getElementById("totalSlots").textContent = slots.length;

        document.getElementById("availableSlots").textContent =
            slots.filter(slot => slot.status === "Available").length;

        document.getElementById("occupiedSlots").textContent =
            slots.filter(slot => slot.status === "Occupied").length;

        document.getElementById("reservedSlots").textContent =
            slots.filter(slot => slot.status === "Reserved").length;

        container.innerHTML = "";

        slots.forEach(slot => {
            const card = document.createElement("div");
            card.className = "slot " + slot.status.toLowerCase();

            card.innerHTML = `
                <h3>${slot.slot_number}</h3>
                <p>${slot.status}</p>
            `;

            if (slot.status === "Available") {
                card.addEventListener("click", () => {
                    selectSlot(slot.slot_number);
                });
            }

            container.appendChild(card);
        });

        message.textContent = "";

    } catch (error) {
        container.textContent = "Unable to load parking slots.";
        message.textContent = error.message;
    }
}

// =====================================
// SELECT PARKING SLOT
// =====================================

function selectSlot(slotNumber) {
    selectedSlotNumber = slotNumber;

    const bookingSection = document.getElementById("bookingSection");
    const selectedSlot = document.getElementById("selectedSlot");
    const bookingResult = document.getElementById("bookingResult");

    if (!bookingSection) {
        alert("Booking form section is missing.");
        return;
    }

    if (selectedSlot) {
        selectedSlot.textContent =
            "Selected Parking Slot: " + slotNumber;
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

// =====================================
// CUSTOMER BOOKING
// =====================================

document.getElementById("bookingForm").addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        if (!selectedSlotNumber) {
            alert("Please select a parking slot.");
            return;
        }

        const bookingData = {
            customer_name: document.getElementById("customerName").value,
            vehicle_number: document.getElementById("vehicleNumber").value,
            slot_number: selectedSlotNumber,
            booking_date: document.getElementById("bookingDate").value,
            start_time: document.getElementById("startTime").value,
            end_time: document.getElementById("endTime").value
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

            if (!data.qr_token) {
                throw new Error(
                    "Booking created, but QR token was not returned."
                );
            }

            window.currentBookingQrToken = data.qr_token;
            saveCustomerBookingToken(data.qr_token);
            window.currentBookingId = data.booking_id;

            result.textContent =
                "Booking successful! Booking ID: " +
                data.booking_id +
                " | Slot: " +
                data.slot_number;

            result.style.color = "#16A34A";

            document.getElementById("bookingForm").reset();

            selectedSlotNumber = null;

            document.getElementById("bookingSection").style.display = "none";

            alert("Booking confirmed! Your Booking ID is " + data.booking_id);

            // Display QR Parking Pass
            const qrPassSection =
                document.getElementById("qrPassSection");

            const bookingQrImage =
                document.getElementById("bookingQrImage");

            const qrBookingDetails =
                document.getElementById("qrBookingDetails");

            const cancelButton =
                document.getElementById("cancelBookingBtn");

            const cancelMessage =
                document.getElementById("cancelBookingMessage");

            if (qrPassSection && bookingQrImage && qrBookingDetails) {

                qrPassSection.style.display = "block";
                qrPassSection.style.visibility = "visible";

                bookingQrImage.style.display = "block";

                qrBookingDetails.textContent =
                    `Booking ID: ${data.booking_id} | Slot: ${data.slot_number}`;

                if (cancelButton) {
                    cancelButton.disabled = false;
                    cancelButton.textContent = "Cancel Booking";
                    console.log("CANCEL BUTTON CREATED FOR:", data.booking_id);
                    
                }

                if (cancelMessage) {
                    cancelMessage.textContent = "";
                }

                bookingQrImage.onload = function () {
                    qrPassSection.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                };

                bookingQrImage.onerror = function () {
                    qrBookingDetails.textContent =
                        "Booking confirmed, but QR image could not be loaded.";
                };

                bookingQrImage.src =
                    `/api/booking-qr/${encodeURIComponent(data.qr_token)}?t=${Date.now()}`;
                console.log("QR ASSIGNMENT REACHED", data.qr_token);

            } else {
                console.error("QR elements missing from index.html.");
            }

            loadSlots();

        } catch (error) {
            result.textContent = error.message;
            result.style.color = "#DC2626";
        }
    }
);

// =====================================
// REFRESH SLOT AVAILABILITY
// =====================================

document.getElementById("bookingDate")?.addEventListener("change", loadSlots);
document.getElementById("startTime")?.addEventListener("change", loadSlots);
document.getElementById("endTime")?.addEventListener("change", loadSlots);

// =====================================
// SMART SLOT RECOMMENDATION
// =====================================

document.getElementById("recommendBtn")?.addEventListener(
    "click",
    async function () {

        const date = document.getElementById("bookingDate")?.value;
        const startTime = document.getElementById("startTime")?.value;
        const endTime = document.getElementById("endTime")?.value;

        const result =
            document.getElementById("recommendationResult");

        if (!date || !startTime || !endTime) {
            result.textContent =
                "Please select your booking date, start time and end time first.";
            return;
        }

        result.textContent = "Finding the best available parking slot...";

        try {
            const params = new URLSearchParams({
                date: date,
                start_time: startTime,
                end_time: endTime
            });

            const response = await fetch(
                "/api/recommend-slot?" + params.toString()
            );

            const data = await response.json();

            if (!response.ok) {
                result.textContent =
                    data.message || data.error || "No available slot found.";
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
            result.textContent =
                "Unable to get a recommendation. Please try again.";
        }
    }
);

// =====================================
// DOWNLOAD QR PARKING PASS
// =====================================

document.getElementById("downloadQrBtn")?.addEventListener(
    "click",
    function () {

        const qrImage =
            document.getElementById("bookingQrImage");

        if (
            !qrImage ||
            !qrImage.src ||
            !qrImage.complete ||
            qrImage.naturalWidth === 0
        ) {
            alert("Please wait until your QR code has loaded.");
            return;
        }

        const downloadLink = document.createElement("a");

        downloadLink.href = qrImage.src;
        downloadLink.download = "SmartPark_QR_Pass.png";

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
    }
);


// CUSTOMER CANCEL BOOKING

document.addEventListener("DOMContentLoaded", () => {
    const cancelButton = document.getElementById("cancelBookingBtn");
    const cancelMessage = document.getElementById("cancelBookingMessage");

    if (!cancelButton) {
        console.error("Cancel Booking button not found.");
        return;
    }

    cancelButton.addEventListener("click", async () => {
        const bookingId = window.currentBookingId;

        if (!bookingId) {
            cancelMessage.textContent =
                "Booking ID not found. Please make a booking first.";
            return;
        }

        const confirmed = confirm(
            "Are you sure you want to cancel this parking booking?"
        );

        if (!confirmed) return;

        cancelButton.disabled = true;
        cancelButton.textContent = "Cancelling...";

        try {
            const response = await fetch(
                `/api/bookings/${bookingId}`,
                {
                    method: "DELETE"
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    result.message ||
                    "Unable to cancel booking."
                );
            }

            cancelMessage.textContent =
                "Your booking has been cancelled successfully!";

            cancelMessage.style.color = "green";

            cancelButton.textContent = "Booking Cancelled";
            cancelButton.disabled = true;

            // Hide the QR pass after successful cancellation
            const qrImage =
                document.getElementById("bookingQrImage");

            if (qrImage) {
                qrImage.style.display = "none";
            }

            window.currentBookingId = null;
            window.currentBookingQrToken = null;

            // Refresh parking slot availability
            if (typeof loadSlots === "function") {
                await loadSlots();
            }

        } catch (error) {
            cancelMessage.textContent = error.message;
            cancelMessage.style.color = "red";

            cancelButton.disabled = false;
            cancelButton.textContent = "Cancel Booking";
        }
    });
});


// =====================================
// INITIALIZE CUSTOMER DASHBOARD
// =====================================

document.addEventListener("DOMContentLoaded", function () {
    loadSlots();
});
// LOAD CUSTOMER BOOKINGS
async function loadCustomerBookings() {
    const bookingsList = document.getElementById("myBookingsList");

    if (!bookingsList) return;

    const tokens = JSON.parse(
        localStorage.getItem("smartpark_customer_booking_tokens") || "[]"
    );

    if (tokens.length === 0) {
        bookingsList.textContent = "You don't have any bookings yet.";
        return;
    }

    try {
        const response = await fetch("/api/customer/bookings/list", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ qr_tokens: tokens })
        });

        if (!response.ok) {
            throw new Error("Unable to load bookings.");
        }

        const bookings = await response.json();
        bookingsList.replaceChildren();

        if (bookings.length === 0) {
            bookingsList.textContent = "No bookings found.";
            return;
        }

        bookings.forEach(booking => {
            const card = document.createElement("div");
            card.className = "booking-history-card";

            const heading = document.createElement("h3");
            heading.textContent = `Booking #${booking.id}`;

            const details = document.createElement("p");
            details.textContent =
                `Name: ${booking.customer_name} | ` +
                `Vehicle: ${booking.vehicle_number} | ` +
                `Slot: ${booking.slot_number}`;

            const timing = document.createElement("p");
            timing.textContent =
                `Date: ${booking.booking_date} | ` +
                `Time: ${booking.start_time} - ${booking.end_time}`;

            const status = document.createElement("p");
            status.textContent = `Status: ${booking.status}`;

            card.append(heading, details, timing, status);

            if (
                booking.status === "Confirmed" &&
                !booking.check_in_time &&
                !booking.check_out_time
            ) {
                const cancelButton = document.createElement("button");
                cancelButton.textContent = "Cancel Booking";
                cancelButton.className = "cancel-booking-btn";

                cancelButton.addEventListener("click", async () => {
                    if (!confirm("Are you sure you want to cancel this booking?")) {
                        return;
                    }

                    const cancelResponse = await fetch(
                        "/api/customer/bookings/cancel",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                qr_token: booking.qr_token
                            })
                        }
                    );

                    const result = await cancelResponse.json();

                    if (cancelResponse.ok) {
                        alert(result.message);
                        loadCustomerBookings();
                    } else {
                        alert(result.error || "Unable to cancel booking.");
                    }
                });

                card.appendChild(cancelButton);
            }

            bookingsList.appendChild(card);
        });

    } catch (error) {
        console.error("Booking history error:", error);
        bookingsList.textContent = "Unable to load bookings. Please refresh.";
    }
}

// LOAD BOOKINGS WHEN CUSTOMER DASHBOARD OPENS
loadCustomerBookings();
// ==========================================================
// SMARTPARK: CUSTOMER BOOKING HISTORY
// ==========================================================

async function loadCustomerBookings() {
    const bookingsList = document.getElementById("myBookingsList");

    if (!bookingsList) {
        console.error("My Bookings section was not found.");
        return;
    }

    const tokens = getCustomerBookingTokens();

    if (tokens.length === 0) {
        bookingsList.replaceChildren();

        const message = document.createElement("p");
        message.textContent =
            "You don't have any saved bookings yet. Make a booking to see it here.";

        bookingsList.appendChild(message);
        return;
    }

    bookingsList.textContent = "Loading your bookings...";

    try {
        const response = await fetch("/api/customer/bookings/list", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                qr_tokens: tokens
            })
        });

        if (!response.ok) {
            throw new Error("Unable to load booking history.");
        }

        const bookings = await response.json();

        bookingsList.replaceChildren();

        if (!Array.isArray(bookings) || bookings.length === 0) {
            const message = document.createElement("p");
            message.textContent = "No bookings found.";
            bookingsList.appendChild(message);
            return;
        }

        bookings.forEach(booking => {
            const card = document.createElement("div");
            card.className = "booking-history-card";

            const heading = document.createElement("h3");
            heading.textContent = `Booking #${booking.id}`;

            const customer = document.createElement("p");
            customer.textContent =
                `Customer: ${booking.customer_name}`;

            const vehicle = document.createElement("p");
            vehicle.textContent =
                `Vehicle: ${booking.vehicle_number}`;

            const slot = document.createElement("p");
            slot.textContent =
                `Parking Slot: ${booking.slot_number || "N/A"}`;

            const date = document.createElement("p");
            date.textContent =
                `Date: ${booking.booking_date}`;

            const timing = document.createElement("p");
            timing.textContent =
                `Time: ${booking.start_time} - ${booking.end_time}`;

            const status = document.createElement("p");
            status.textContent = `Status: ${booking.status}`;
            status.className = "booking-status";

            card.append(
                heading,
                customer,
                vehicle,
                slot,
                date,
                timing,
                status
            );

            const canCancel =
                booking.status === "Confirmed" &&
                !booking.check_in_time &&
                !booking.check_out_time;

            if (canCancel) {
                const cancelButton = document.createElement("button");

                cancelButton.type = "button";
                cancelButton.textContent = "Cancel Booking";
                cancelButton.className = "cancel-booking-btn";

                cancelButton.addEventListener("click", async () => {
                    const confirmed = window.confirm(
                        `Are you sure you want to cancel Booking #${booking.id}?`
                    );

                    if (!confirmed) {
                        return;
                    }

                    cancelButton.disabled = true;
                    cancelButton.textContent = "Cancelling...";

                    try {
                        const cancelResponse = await fetch(
                            "/api/customer/bookings/cancel",
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    qr_token: booking.qr_token
                                })
                            }
                        );

                        const result = await cancelResponse.json();

                        if (!cancelResponse.ok) {
                            throw new Error(
                                result.error || "Unable to cancel booking."
                            );
                        }

                        alert(result.message);

                        await loadCustomerBookings();

                        // Refresh parking availability.
                        if (typeof loadSlots === "function") {
                            await loadSlots();
                        }

                        // Hide the current QR pass if it belongs
                        // to the booking that was cancelled.
                        if (
                            window.currentBookingQrToken === booking.qr_token
                        ) {
                            window.currentBookingQrToken = null;

                            const qrSection =
                                document.getElementById("qrPassSection");

                            if (qrSection) {
                                qrSection.style.display = "none";
                            }
                        }

                    } catch (error) {
                        alert(error.message);

                        cancelButton.disabled = false;
                        cancelButton.textContent = "Cancel Booking";
                    }
                });

                card.appendChild(cancelButton);
            }

            bookingsList.appendChild(card);
        });

    } catch (error) {
        console.error("My Bookings error:", error);

        bookingsList.textContent =
            "Unable to load bookings. Please refresh the page.";
    }
}


// ==========================================================
// LOAD CUSTOMER BOOKINGS WHEN DASHBOARD OPENS
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
    loadCustomerBookings();
});