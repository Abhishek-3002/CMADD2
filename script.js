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

/* Site-wide call selector on every CMADD2 page */
(function(){
  if(document.getElementById('callModal') || document.getElementById('cmaddGlobalCallOverlay')) return;
  const overlay=document.createElement('div');
  overlay.id='cmaddGlobalCallOverlay';overlay.className='cmadd-call-overlay';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','cmaddGlobalCallTitle');
  overlay.innerHTML='<div class="cmadd-call-panel"><button type="button" class="cmadd-call-close" aria-label="Close call options">×</button><span style="font-size:12px;letter-spacing:2px;font-weight:800;color:#0866ff">TALK TO OUR TEAM</span><h2 id="cmaddGlobalCallTitle">Who would you like to call?</h2><p>Choose a contact and your phone will open the call screen.</p><a class="cmadd-call-choice" href="tel:8000540156"><span class="cmadd-call-avatar">A</span><span><b>Abhishek</b><small>8000540156</small></span><span class="cmadd-call-arrow">↗</span></a><a class="cmadd-call-choice" href="tel:9352642174"><span class="cmadd-call-avatar">V</span><span><b>Vishal</b><small>93526 42174</small></span><span class="cmadd-call-arrow">↗</span></a></div>';
  document.body.appendChild(overlay);
  const fab=document.createElement('button');fab.type='button';fab.className='cmadd-call-fab';fab.textContent='☎ Call Us';fab.setAttribute('aria-label','Choose a contact to call');document.body.appendChild(fab);
  const close=overlay.querySelector('.cmadd-call-close');
  function open(){overlay.classList.add('cmadd-open');document.body.style.overflow='hidden';close.focus()}
  function shut(){overlay.classList.remove('cmadd-open');document.body.style.overflow=''}
  fab.addEventListener('click',open);close.addEventListener('click',shut);
  overlay.addEventListener('click',e=>{if(e.target===overlay)shut()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('cmadd-open'))shut()});
})();
