(async function(){
const WA='918000540156',root=document.getElementById('products');
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
try{
 const r=await fetch('/api/products');if(!r.ok)return;const d=await r.json();const list=d.products||[];
 const byKey=new Set();
 list.forEach(p=>{
  const key=String(p.name||'').trim().toLowerCase();if(!key)return;byKey.add(key);
  let card=[...document.querySelectorAll('.product')].find(el=>(el.querySelector('h3')?.textContent||'').trim().toLowerCase()===key);
  if(card){card.style.display=p.active===false?'none':'';card.dataset.availability=p.availability||'Contact for Availability';const old=card.querySelector('.availability');if(old)old.remove();const badge=document.createElement('p');badge.className='availability';badge.textContent=p.availability||'Contact for Availability';badge.style.cssText='font-size:12px;font-weight:700;color:#087f8c;margin:8px 0';card.querySelector('.info')?.insertBefore(badge,card.querySelector('.qtyrow'));return}
  if(p.active===false)return;
  const cardNew=document.createElement('article');cardNew.className='product';cardNew.dataset.name=p.name+' '+(p.category||'');cardNew.dataset.availability=p.availability||'Contact for Availability';
  cardNew.innerHTML='<div class="imgbox">'+(p.image_url?'<img loading="lazy" src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'">':'<div style="padding:35px;text-align:center;font-size:38px">💊</div>')+'</div><div class="info"><div class="brand">'+esc(p.category||'Product')+'</div><h3>'+esc(p.name)+'</h3><p class="availability" style="font-size:12px;font-weight:700;color:#087f8c;margin:8px 0">'+esc(p.availability||'Contact for Availability')+'</p><div class="qtyrow"><button onclick="changeQty(this,-1)">−</button><span>1</span><button onclick="changeQty(this,1)">+</button></div><button class="add" onclick="addToCart(this,\''+String(p.name).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">Add to Cart</button></div>';
  root?.appendChild(cardNew);
 });
 const cr=await fetch('/api/campaigns');if(cr.ok){const cd=await cr.json();const campaigns=cd.campaigns||[];if(campaigns.length){const hero=document.querySelector('.hero');const section=document.createElement('section');section.style.cssText='max-width:1100px;margin:16px auto;padding:0 18px;display:grid;gap:12px';section.innerHTML=campaigns.map(c=>'<div style="border-radius:16px;overflow:hidden;background:#123b5d;color:white;padding:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">'+(c.banner_url?'<img src="'+esc(c.banner_url)+'" alt="" style="width:140px;max-height:90px;object-fit:cover;border-radius:10px">':'')+'<div style="flex:1"><h2>'+esc(c.title)+'</h2><p style="margin-top:6px">'+esc(c.details)+'</p></div><button onclick="window.open(\'https://wa.me/'+WA+'?text=\'+encodeURIComponent('+JSON.stringify('Hello, please share details for campaign: ')+'+'+JSON.stringify(c.title)+'),\'_blank\')">WhatsApp Enquiry</button></div>').join('');hero?.insertAdjacentElement('afterend',section)}}
 if(typeof updateCount==='function')updateCount();if(typeof renderCart==='function')renderCart();
}catch(e){console.warn('CMADD2 live catalog unavailable:',e.message)}
})();