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