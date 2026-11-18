/* Shared CMADD2 countdown: visible on every site/dashboard page */
(function(){
  function init(){
    if(document.getElementById('countdownDays')) return; // Admin page already contains its own countdown.
    if(!document.body || document.getElementById('cmadd2SharedCountdown')) return;
    const widget=document.createElement('section');
    widget.className='cmadd2-countdown';
    widget.id='cmadd2SharedCountdown';
    widget.setAttribute('aria-label','February 2027 countdown');
    widget.innerHTML='<div><p class="cmadd2-countdown-title">⏳ February 2027 Countdown</p><p class="cmadd2-countdown-subtitle" id="cmadd2CountdownMessage">Time remaining until 1 February 2027, 12:00 AM IST</p></div><div class="cmadd2-countdown-units"><div class="cmadd2-countdown-unit"><span class="cmadd2-countdown-number" id="cmadd2Days">--</span><span class="cmadd2-countdown-label">Days</span></div><div class="cmadd2-countdown-unit"><span class="cmadd2-countdown-number" id="cmadd2Hours">--</span><span class="cmadd2-countdown-label">Hours</span></div><div class="cmadd2-countdown-unit"><span class="cmadd2-countdown-number" id="cmadd2Minutes">--</span><span class="cmadd2-countdown-label">Minutes</span></div><div class="cmadd2-countdown-unit"><span class="cmadd2-countdown-number" id="cmadd2Seconds">--</span><span class="cmadd2-countdown-label">Seconds</span></div></div>';
    document.body.insertBefore(widget,document.body.firstChild);
    const target=new Date('2027-02-01T00:00:00+05:30').getTime();
    const el={days:widget.querySelector('#cmadd2Days'),hours:widget.querySelector('#cmadd2Hours'),minutes:widget.querySelector('#cmadd2Minutes'),seconds:widget.querySelector('#cmadd2Seconds'),message:widget.querySelector('#cmadd2CountdownMessage')};
    function update(){
      const left=Math.max(0,target-Date.now()), total=Math.floor(left/1000);
      el.days.textContent=Math.floor(total/86400);
      el.hours.textContent=String(Math.floor(total%86400/3600)).padStart(2,'0');
      el.minutes.textContent=String(Math.floor(total%3600/60)).padStart(2,'0');
      el.seconds.textContent=String(total%60).padStart(2,'0');
      if(left<=0){el.message.textContent='February 2027 has arrived!';clearInterval(timer);}
    }
    update();const timer=setInterval(update,1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
