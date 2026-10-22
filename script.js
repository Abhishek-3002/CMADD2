document.addEventListener("DOMContentLoaded", function () {

    console.log("Choudhary Medical website loaded successfully.");

    // Mobile Menu
    const menuBtn = document.querySelector(".menu-btn");
    const nav = document.querySelector("nav");

    if (menuBtn && nav) {

        menuBtn.addEventListener("click", function () {

            if (nav.style.display === "flex") {

                nav.style.display = "none";

            } else {

                nav.style.display = "flex";
                nav.style.flexDirection = "column";
                nav.style.position = "absolute";
                nav.style.top = "80px";
                nav.style.right = "5%";
                nav.style.background = "white";
                nav.style.padding = "20px";
                nav.style.borderRadius = "12px";
                nav.style.boxShadow =
                    "0 10px 30px rgba(0,0,0,0.12)";
                nav.style.zIndex = "999";

            }

        });

    }


    // Subtle scroll-reveal motion for service cards; graceful fallback when unsupported.
    const cards = document.querySelectorAll(".service-card");
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        cards.forEach(card => card.classList.add("reveal-ready"));
        const revealObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -25px 0px" });
        cards.forEach(card => revealObserver.observe(card));
    }


    // Privacy-minimal analytics: record page views and WhatsApp link clicks only.
    // No names, phone numbers, IP addresses, or message contents are collected.
    const analyticsPage = window.location.pathname || "/";
    const sendAnalytics = (eventType) => {
        try {
            fetch("/api/analytics/event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventType, pagePath: analyticsPage }),
                keepalive: true
            }).catch(() => {});
        } catch (_) { /* Analytics must never break core website actions. */ }
    };
    sendAnalytics("page_view");
    document.querySelectorAll('a[href*="wa.me/"], a[href*="whatsapp.com/"]').forEach(link => {
        link.addEventListener("click", () => sendAnalytics("whatsapp_click"));
    });

    // WhatsApp buttons
    const whatsappButtons =
        document.querySelectorAll(".whatsapp");

    whatsappButtons.forEach(function (button) {

        button.addEventListener("click", function () {

            console.log("WhatsApp enquiry button clicked.");

        });

    });

    console.log(
        "Welcome to Choudhary Medical and Drug Distributors"
    );

});