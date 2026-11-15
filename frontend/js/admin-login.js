document.getElementById("adminLoginForm").addEventListener("submit", async function(event) {

    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    const message = document.getElementById("loginMessage");

    message.textContent = "Checking login...";

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const result = await response.json();

        if (response.ok) {
            message.textContent = "Login successful!";

            window.location.href = "/admin";
        } else {
            message.textContent = result.error || "Invalid login details.";
        }

    } catch (error) {
        message.textContent = "Server connection error.";
        console.error(error);
    }
});